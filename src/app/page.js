'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import OrderCard from '../components/OrderCard';
import Link from 'next/link';

export default function Home() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [participants, setParticipants] = useState([]);
  const [menus, setMenus] = useState([]);
  const [orders, setOrders] = useState([]);
  const [absents, setAbsents] = useState([]);
  
  const [isLocked, setIsLocked] = useState(false);
  const [lockReason, setLockReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [globalLoading, setGlobalLoading] = useState(false); 

  const [globalCollapsed, setGlobalCollapsed] = useState(true); 
  const [summaryMode, setSummaryMode] = useState('menu'); 
  const [newGuest, setNewGuest] = useState('');
  
  const [modalOpen, setModalOpen] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [copyStatus, setCopyStatus] = useState('Salin ringkasan dan kirim ke WhatsApp.');

  const [bannerVisible, setBannerVisible] = useState(true);
  const [cutoffTime, setCutoffTime] = useState('11:00');

  useEffect(() => {
    fetchInitialData(false);
    setBannerVisible(true);
  }, [date]);

  const fetchInitialData = async (isSilent = true) => {
    if (!isSilent) setLoading(true);

    const { data: sets } = await supabase.from('settings').select('*');
    const config = {};
    sets?.forEach(s => config[s.key] = s.value);
    setCutoffTime(config.cutoff_time || '11:00');
    
    const { data: pData } = await supabase.from('participants').select('*').order('created_at', { ascending: true });
    const { data: mData } = await supabase.from('menus').select('*').eq('is_active', true);
    const { data: oData } = await supabase.from('orders').select('*').eq('order_date', date).order('created_at', { ascending: true });
    const { data: aData } = await supabase.from('attendance').select('*').eq('attendance_date', date).eq('is_absent', true);

    const validParticipants = pData?.filter(p => p.is_active || oData?.some(o => o.participant_id === p.id)) || [];

    let lockedStatus = false;
    let reason = '';
    const today = new Date().toISOString().split('T')[0];
    
    if (date < today) {
      lockedStatus = true; reason = 'Tanggal sudah lewat.';
    } else if (config.lock_status === 'On' && date === today) {
      const now = new Date();
      const [h, m] = (config.cutoff_time || '11:00').split(':');
      const cutoff = new Date(); cutoff.setHours(h, m, 0);
      if (now >= cutoff) {
        lockedStatus = true; reason = `Batas cut-off (${config.cutoff_time} WIB) telah lewat.`;
      }
    }

    setIsLocked(lockedStatus);
    setLockReason(reason);
    setParticipants(validParticipants);
    setMenus(mData || []);
    setOrders(oData || []);
    setAbsents(aData?.map(a => a.participant_id) || []);
    
    if (lockedStatus && date === today) {
       await fetch('/api/autofill', { method: 'POST', body: JSON.stringify({ date }) });
       const { data: updatedOrders } = await supabase.from('orders').select('*').eq('order_date', date);
       setOrders(updatedOrders || []);
    }

    if (!isSilent) setLoading(false);
  };

  const handleAddGuest = async (e) => {
    e.preventDefault();
    if (!newGuest) return;
    setGlobalLoading(true);
    
    const { data: newP } = await supabase.from('participants').insert([
      { name: newGuest, role: 'management', is_active: false }
    ]).select().single();

    if (newP) {
      await supabase.from('orders').insert([{ participant_id: newP.id, order_date: date, source: 'MANUAL' }]);
      setNewGuest('');
      await fetchInitialData(true); 
    }
    setGlobalLoading(false);
  };

  const handleAbsentChange = (participantId, isNowAbsent) => {
    setAbsents(prev => isNowAbsent ? [...prev, participantId] : prev.filter(id => id !== participantId));
  };

  const calculateMajority = (type) => {
    const validOrders = orders.filter(o => {
      const p = participants.find(x => x.id === o.participant_id);
      return p && p.role !== 'director';
    });

    const counts = {};
    const firstSeen = {};

    validOrders.forEach((o, index) => {
      const val = type === 'makanan' ? (o.menu_name === '__custom__' ? o.custom_menu : o.menu_name) : (o.drink_name === '__custom__' ? o.custom_drink : o.drink_name);
      if (!val) return;
      if (!counts[val]) { counts[val] = 0; firstSeen[val] = index; }
      counts[val]++;
    });

    let maxCount = 0;
    let candidates = [];
    for (const [name, count] of Object.entries(counts)) {
      if (count > maxCount) { maxCount = count; candidates = [name]; }
      else if (count === maxCount) { candidates.push(name); }
    }

    if (candidates.length === 0) return 'Belum Ada';
    if (candidates.length === 1) return candidates[0].replace(' @ ', ' - ');

    const priorityCandidates = candidates.filter(c => {
      const menuObj = menus.find(m => (m.vendor_name ? `${m.name} @ ${m.vendor_name}` : m.name) === c);
      return menuObj && menuObj.is_priority;
    });

    const finalCandidates = priorityCandidates.length > 0 ? priorityCandidates : candidates;
    finalCandidates.sort((a, b) => firstSeen[a] - firstSeen[b]);
    return finalCandidates[0].replace(' @ ', ' - ');
  };

  const majMakanan = calculateMajority('makanan');
  const majMinuman = calculateMajority('minuman');

  // --- PERBAIKAN SORTING DI TEKS WHATSAPP ---
  const generateSummaryText = () => {
    let text = `Tanggal: ${date}\n\n*Makanan*\n`;
    const makananMap = {}; const minumanMap = {};

    participants.forEach(p => {
      const order = orders.find(o => o.participant_id === p.id);
      if(absents.includes(p.id) || !order) return;

      const finalFood = order.menu_name === '__custom__' ? order.custom_menu : order.menu_name;
      const finalDrink = order.drink_name === '__custom__' ? order.custom_drink : order.drink_name;
      
      if (finalFood) {
        if (!makananMap[finalFood]) makananMap[finalFood] = [];
        makananMap[finalFood].push({ nama: p.name, note: order.notes_food || '' });
      }
      if (finalDrink) {
        if (!minumanMap[finalDrink]) minumanMap[finalDrink] = [];
        minumanMap[finalDrink].push({ nama: p.name, note: order.notes_drink || '' });
      }
    });

    if(Object.keys(makananMap).length === 0 && Object.keys(minumanMap).length === 0) return 'Belum ada pesanan untuk diringkas.';

    // Urutkan berdasarkan jumlah makanan terbanyak
    const sortedMakananWA = Object.keys(makananMap).sort((a, b) => makananMap[b].length - makananMap[a].length);
    sortedMakananWA.forEach(menu => {
      const items = makananMap[menu];
      const menuDisplay = menu.replace(' @ ', ' - ');
      text += `${items.length}x ${menuDisplay}\n`;
      items.forEach(i => { text += `${i.nama}:${i.note ? ' ' + i.note : ''}\n`; });
      text += '\n';
    });

    text += `*Minum*\n`;
    
    // Urutkan berdasarkan jumlah minuman terbanyak
    const sortedMinumanWA = Object.keys(minumanMap).sort((a, b) => minumanMap[b].length - minumanMap[a].length);
    sortedMinumanWA.forEach(drink => {
      const items = minumanMap[drink];
      const drinkDisplay = drink.replace(' @ ', ' - ');
      text += `${items.length}x ${drinkDisplay}\n`;
      items.forEach(i => { text += `${i.nama}:${i.note ? ' ' + i.note : ''}\n`; });
      text += '\n';
    });

    return text.trim();
  };

  const openSummaryModal = () => {
    const text = generateSummaryText();
    setSummaryText(text);
    setCopyStatus(text === 'Belum ada pesanan untuk diringkas.' ? text : 'Salin ringkasan dan kirim ke WhatsApp.');
    setModalOpen(true);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(summaryText);
    setCopyStatus('Berhasil disalin ke clipboard.');
    setTimeout(() => setCopyStatus('Salin ringkasan dan kirim ke WhatsApp.'), 3000);
  };

  const getSummaryNama = () => {
    return participants.map(p => {
      const order = orders.find(o => o.participant_id === p.id);
      const isAbsent = absents.includes(p.id);
      
      let statusObj = { text: 'Belum pesan', class: 'bg-danger bg-opacity-25 text-danger border-danger border-opacity-25' };
      if (isAbsent) {
        statusObj = { text: 'Tidak Hadir', class: 'bg-danger text-white' };
      } else if (order && (order.menu_name || order.drink_name || order.custom_menu)) {
        if (order.source === 'AUTO') statusObj = { text: 'Auto pesan', class: 'bg-success text-white' };
        else statusObj = { text: 'Sudah pesan', class: 'bg-success bg-opacity-25 text-success border-success border-opacity-25' };
      }

      const finalFood = order?.menu_name === '__custom__' ? order?.custom_menu : order?.menu_name;
      const finalDrink = order?.drink_name === '__custom__' ? order?.custom_drink : order?.drink_name;

      return {
        nama: p.name, makanan: finalFood || '-', minuman: finalDrink || '-',
        keterangan: [order?.notes_food, order?.notes_drink].filter(Boolean).join(' · ') || '-', statusObj
      };
    });
  };

  const getSummaryMenu = () => {
    const makananMap = {}; const minumanMap = {};
    orders.forEach(o => {
      const p = participants.find(x => x.id === o.participant_id);
      const pName = p ? p.name : 'Unknown';
      const finalFood = o.menu_name === '__custom__' ? o.custom_menu : o.menu_name;
      const finalDrink = o.drink_name === '__custom__' ? o.custom_drink : o.drink_name;

      if (finalFood) {
        if (!makananMap[finalFood]) makananMap[finalFood] = [];
        makananMap[finalFood].push({ nama: pName, note: o.notes_food });
      }
      if (finalDrink) {
        if (!minumanMap[finalDrink]) minumanMap[finalDrink] = [];
        minumanMap[finalDrink].push({ nama: pName, note: o.notes_drink });
      }
    });
    return { makanan: makananMap, minuman: minumanMap };
  };

  const totalPeserta = participants.length;
  const hadirPeserta = totalPeserta - absents.length;

  // Variabel untuk UI Tabel (Sorting & Kalkulasi Total Porsi)
  const summaryMenuData = getSummaryMenu();
  const sortedMakananUI = Object.entries(summaryMenuData.makanan).sort((a, b) => b[1].length - a[1].length);
  const sortedMinumanUI = Object.entries(summaryMenuData.minuman).sort((a, b) => b[1].length - a[1].length);
  
  const totalMakananUI = sortedMakananUI.reduce((sum, item) => sum + item[1].length, 0);
  const totalMinumanUI = sortedMinumanUI.reduce((sum, item) => sum + item[1].length, 0);

  return (
    <>
      <div className="sticky-top shadow-sm w-100" style={{ zIndex: 1020 }}>
        <div className="bg-white py-2 px-3 border-bottom">
          <div className="container d-flex justify-content-between align-items-center p-0" style={{ maxWidth: '720px' }}>
            <div className="d-flex align-items-center">
              <img src="https://i.imgur.com/3ItDqk6.png" height="36" alt="Logo" className="me-2" />
              <div>
                <h1 className="m-0 text-dark fw-bold" style={{ fontSize: '18px' }}>Lunch Order</h1>
                <div className="text-muted" style={{ fontSize: '12px' }}>Management LPI Abata Leaderss</div>
              </div>
            </div>
            <Link href="/login" className="btn btn-outline-primary rounded-pill px-3 fw-bold mt-1" style={{ fontSize: '13px' }}>Admin</Link>
          </div>
        </div>
        
        {bannerVisible && (
          <div className="w-100 py-2 px-3 d-flex justify-content-between align-items-center" style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#ffffff' }}>
            <div className="container d-flex align-items-center gap-2 p-0" style={{ maxWidth: '720px', fontSize: '13px' }}>
              <span className="badge bg-dark bg-opacity-25 rounded-pill px-2 py-1 fw-normal text-uppercase" style={{ letterSpacing: '0.5px' }}>
                <i className="bi bi-exclamation-triangle-fill text-warning me-1"></i> Penting
              </span>
              <span className="fw-medium">Batas pengisian {cutoffTime} WIB atau menu sesuai mayoritas.</span>
            </div>
            <button onClick={() => setBannerVisible(false)} className="btn btn-sm text-white p-0 border-0 ms-2" aria-label="Tutup"><i className="bi bi-x-lg fs-6"></i></button>
          </div>
        )}
      </div>

      <div className="container py-4">
        <main className="mx-auto" style={{ maxWidth: '720px' }}>
          
          <section className="card p-3 mb-4 shadow-sm border-0 rounded-4">
            <label className="fw-bold text-muted mb-2 small">Tanggal Rapat</label>
            <input type="date" className="form-control border-0 bg-light fw-bold px-3 py-2 text-dark" value={date} onChange={e => setDate(e.target.value)} />
          </section>

          <section className="card p-4 mb-4 shadow-sm border-0 rounded-4">
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 border-bottom pb-3 gap-3">
              <div>
                <h5 className="m-0 fw-bold text-dark">Daftar Peserta & Pesanan</h5>
                <div className="fw-bold mt-2" style={{ fontSize: '13px' }}>
                  <span className="text-secondary bg-light px-2 py-1 rounded-pill me-2 border">Peserta: {totalPeserta}</span>
                  <span className="text-success bg-success bg-opacity-10 border border-success border-opacity-25 px-2 py-1 rounded-pill me-2">Hadir: {hadirPeserta}</span>
                  <span className="text-danger bg-danger bg-opacity-10 border border-danger border-opacity-25 px-2 py-1 rounded-pill">Absen: {absents.length}</span>
                </div>
              </div>
              <button onClick={() => setGlobalCollapsed(!globalCollapsed)} className="btn btn-sm btn-light border rounded-pill px-3 fw-medium text-dark align-self-start align-self-md-center">
                <i className={`bi bi-chevron-${globalCollapsed ? 'down' : 'up'} me-1`}></i> {globalCollapsed ? 'Expand Semua' : 'Collapse Semua'}
              </button>
            </div>

            {isLocked && (
              <div className="alert alert-warning text-center rounded-4 p-3 small fw-bold mb-4 border border-warning shadow-sm" style={{backgroundColor: '#fff5de', color: '#b45309'}}>
                <div className="mb-3 fs-6">
                  <i className="bi bi-lock-fill me-1"></i> Pengisian ditutup. Batas cut-off ({cutoffTime} WIB) telah lewat.
                </div>
                
                <div className="row g-2 justify-content-center px-1">
                  <div className="col-12 col-sm-auto">
                    <div className="bg-white text-danger rounded-pill px-3 py-2 shadow-sm border border-danger border-opacity-25 d-flex align-items-center justify-content-center w-100" style={{fontSize: '12px'}}>
                      <i className="bi bi-fire me-1"></i>Makanan: {majMakanan}
                    </div>
                  </div>
                  <div className="col-12 col-sm-auto">
                    <div className="bg-white text-info rounded-pill px-3 py-2 shadow-sm border border-info border-opacity-25 d-flex align-items-center justify-content-center w-100" style={{fontSize: '12px'}}>
                      <i className="bi bi-droplet-fill me-1"></i>Minuman: {majMinuman}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {loading ? (
              <div className="text-center py-5 text-muted">
                <div className="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
                <div className="small fw-medium">Memuat data peserta...</div>
              </div>
            ) : (
              <div className="d-flex flex-column">
                {participants.map(p => (
                  <OrderCard 
                    key={p.id} p={p} date={date} menus={menus} isLocked={isLocked}
                    existingOrder={orders.find(o => o.participant_id === p.id)}
                    existingAbsent={absents.includes(p.id)}
                    onRefresh={() => fetchInitialData(true)}
                    onAbsentChange={handleAbsentChange}
                    globalCollapsed={globalCollapsed}
                  />
                ))}
                
                {!isLocked && (
                  <form onSubmit={handleAddGuest} className="mt-3 p-3 bg-light rounded-4 border d-flex flex-column flex-sm-row align-items-center gap-2" style={{borderStyle: 'dashed !important', borderColor: '#cbd5e1 !important'}}>
                    <input type="text" className="form-control border-0 bg-white shadow-sm" placeholder="Ketik nama peserta dadakan / tamu..." value={newGuest} onChange={e=>setNewGuest(e.target.value)} required />
                    <button type="submit" className="btn btn-white border shadow-sm rounded-pill px-4 fw-bold text-dark text-nowrap w-100 w-sm-auto"><i className="bi bi-plus-circle text-primary me-1"></i> Tambah</button>
                  </form>
                )}
              </div>
            )}
          </section>

          <section className="card p-4 shadow-sm border-0 rounded-4">
             <div className="mb-4">
                <h5 className="fw-bold mb-1 text-dark">Ringkasan Pesanan</h5>
                <div className="text-muted small">Rekapitulasi otomatis untuk memudahkan tim K3.</div>
             </div>
             <div className="d-flex gap-2 mb-4">
              <button className={`btn btn-sm rounded-pill px-4 fw-medium ${summaryMode === 'menu' ? 'btn-primary shadow-sm' : 'btn-light border text-dark'}`} onClick={() => setSummaryMode('menu')}>Group by Menu</button>
              <button className={`btn btn-sm rounded-pill px-4 fw-medium ${summaryMode === 'nama' ? 'btn-primary shadow-sm' : 'btn-light border text-dark'}`} onClick={() => setSummaryMode('nama')}>Group by Nama</button>
            </div>
            
            <div className="table-responsive rounded-3 border mb-4">
              <table className="table table-hover m-0 align-middle bg-white" style={{ fontSize: '13px' }}>
                <thead className="table-light">
                  {summaryMode === 'menu' ? (
                    <tr><th className="py-3 px-3">Menu/Minuman</th><th>Jml</th><th>Keterangan</th><th className="py-3 px-3">Pemesan</th></tr>
                  ) : (
                    <tr><th className="py-3 px-3">Nama</th><th>Makanan</th><th>Minuman</th><th>Ket</th><th className="py-3 px-3 text-center">Status</th></tr>
                  )}
                </thead>
                <tbody>
                  {summaryMode === 'menu' ? (
                    <>
                      <tr>
                        <td colSpan="4" className="fw-bold text-primary bg-primary bg-opacity-10 py-2 px-3">
                          Makanan <span className="badge bg-primary rounded-pill ms-2">{totalMakananUI} Porsi</span>
                        </td>
                      </tr>
                      {sortedMakananUI.map(([menu, items]) => (
                         <tr key={menu}>
                           <td className="fw-bold px-3 text-dark">{menu.replace(' @ ', ' - ')}</td>
                           <td>{items.length}</td>
                           <td className="text-muted">{items.map(i => i.note).filter(Boolean).join(', ') || '-'}</td>
                           <td className="px-3">{items.map(i => i.nama).join(', ')}</td>
                         </tr>
                      ))}
                      
                      <tr>
                        <td colSpan="4" className="fw-bold text-info bg-info bg-opacity-10 py-2 px-3">
                          Minuman <span className="badge bg-info rounded-pill ms-2">{totalMinumanUI} Porsi</span>
                        </td>
                      </tr>
                      {sortedMinumanUI.map(([drink, items]) => (
                         <tr key={drink}>
                           <td className="fw-bold px-3 text-dark">{drink.replace(' @ ', ' - ')}</td>
                           <td>{items.length}</td>
                           <td className="text-muted">{items.map(i => i.note).filter(Boolean).join(', ') || '-'}</td>
                           <td className="px-3">{items.map(i => i.nama).join(', ')}</td>
                         </tr>
                      ))}
                    </>
                  ) : (
                    getSummaryNama().map((r, idx) => (
                      <tr key={idx}>
                        <td className="fw-bold px-3 text-dark">{r.nama}</td><td>{r.makanan}</td><td>{r.minuman}</td><td className="text-muted">{r.keterangan}</td>
                        <td className="px-3 text-center"><span className={`badge rounded-pill px-2 py-1 border ${r.statusObj.class}`}>{r.statusObj.text}</span></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
             
             <button onClick={openSummaryModal} className="btn btn-primary w-100 rounded-pill fw-bold py-3 shadow-sm">
                <i className="bi bi-whatsapp me-2 fs-5 align-middle"></i> Salin Ringkasan untuk WA
             </button>
          </section>

        </main>
      </div>

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.4)', zIndex: 1050, backdropFilter: 'blur(2px)' }}>
          <div className="bg-white p-4 rounded-4 shadow-lg" style={{ maxWidth: '500px', width: '92%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="d-flex justify-content-between align-items-center border-bottom pb-3">
              <span className="fw-bold fs-5 text-dark">Teks Ringkasan Pesanan</span>
              <button onClick={() => setModalOpen(false)} className="btn btn-light btn-sm rounded-circle text-muted border"><i className="bi bi-x-lg"></i></button>
            </div>
            <textarea readOnly value={summaryText} className="form-control bg-light text-dark" style={{ minHeight: '250px', fontSize: '13px', fontFamily: 'monospace', resize: 'none', border: '1px solid #e2e8f0' }} />
            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center mt-2 gap-3">
              <span className={`small ${copyStatus.includes("Berhasil") ? "text-success fw-bold" : "text-muted"}`}><i className={`bi ${copyStatus.includes("Berhasil") ? "bi-check-circle-fill" : "bi-info-circle-fill"} me-1`}></i>{copyStatus}</span>
              <div className="d-flex gap-2">
                <button onClick={() => setModalOpen(false)} className="btn btn-light border px-4 rounded-pill fw-medium text-dark w-100 w-sm-auto">Tutup</button>
                <button onClick={copyToClipboard} disabled={summaryText === "Belum ada pesanan untuk diringkas."} className="btn btn-primary px-4 rounded-pill fw-bold shadow-sm w-100 w-sm-auto">Copy</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {globalLoading && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.7)', zIndex: 2000 }}>
           <div className="bg-white border px-4 py-3 rounded-pill shadow d-flex align-items-center gap-3">
              <div className="spinner-border spinner-border-sm text-primary" role="status"></div>
              <span className="fw-bold text-dark">Memproses...</span>
           </div>
        </div>
      )}
    </>
  );
}