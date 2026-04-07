'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('pengaturan');
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]); 

  const [settings, setSettings] = useState({ lock_status: 'On', cutoff_time: '11:00' });
  const [participants, setParticipants] = useState([]);
  const [menus, setMenus] = useState([]);
  const [orders, setOrders] = useState([]);
  const [absents, setAbsents] = useState([]);

  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editForm, setEditForm] = useState({ menu_name: '', drink_name: '', notes_food: '', notes_drink: '' });
  const [newParticipant, setNewParticipant] = useState({ name: '', role: 'management' });
  
  // Perbaikan: Tambah state is_priority
  const [newMenu, setNewMenu] = useState({ type: 'makanan', name: '', vendor_name: '', custom_vendor: '', visible_to: '', daysMode: 'all', customDays: [], is_priority: false });
  const [editingMenuId, setEditingMenuId] = useState(null);

  useEffect(() => {
    const isAdmin = localStorage.getItem('isAdmin');
    if (isAdmin !== 'true') router.push('/login');
    else fetchData();
  }, [date]);

  const fetchData = async () => {
    setLoading(true);
    const { data: setItem } = await supabase.from('settings').select('*');
    if (setItem) {
      const config = {};
      setItem.forEach(s => config[s.key] = s.value);
      setSettings({ lock_status: config.lock_status || 'On', cutoff_time: config.cutoff_time || '11:00' });
    }
    
    const { data: pItem } = await supabase.from('participants').select('*').order('created_at', { ascending: true });
    if (pItem) setParticipants(pItem);
    
    const { data: mItem } = await supabase.from('menus').select('*').order('created_at', { ascending: true });
    if (mItem) setMenus(mItem);

    const { data: oItem } = await supabase.from('orders').select('*').eq('order_date', date);
    if (oItem) setOrders(oItem);

    const { data: aItem } = await supabase.from('attendance').select('*').eq('attendance_date', date).eq('is_absent', true);
    if (aItem) setAbsents(aItem.map(a => a.participant_id));
    
    setLoading(false);
  };

  const handleToggleLock = () => {
    const nextStatus = settings.lock_status === 'On' ? 'Off' : 'On';
    setSettings({ ...settings, lock_status: nextStatus });
  };

  const saveSettings = async () => {
    await supabase.from('settings').upsert([{ key: 'lock_status', value: settings.lock_status }, { key: 'cutoff_time', value: settings.cutoff_time }]);
    alert('Pengaturan berhasil disimpan!');
  };

  const startEditOrder = (pId, currentOrder) => {
    setEditingOrderId(pId);
    setEditForm({
      menu_name: currentOrder?.menu_name || '', drink_name: currentOrder?.drink_name || '',
      notes_food: currentOrder?.notes_food || '', notes_drink: currentOrder?.notes_drink || ''
    });
  };

  const saveOrderAdmin = async (pId) => {
    const { error } = await supabase.from('orders').upsert({ participant_id: pId, order_date: date, ...editForm, source: 'MANUAL' }, { onConflict: 'participant_id, order_date' });
    if (!error) { setEditingOrderId(null); fetchData(); }
  };

  const resetAllOrdersForDate = async () => {
    if (!confirm(`HATI-HATI! Yakin ingin MERESET SEMUA pesanan pada tanggal ${date}?`)) return;
    setLoading(true);
    await supabase.from('orders').update({
      menu_name: null, drink_name: null, custom_menu: null, custom_drink: null, notes_food: null, notes_drink: null, source: 'MANUAL'
    }).eq('order_date', date);
    fetchData();
  };

  const resetParticipantOrder = async (pId, pName) => {
    if (!confirm(`Reset pesanan milik ${pName}?`)) return;
    setLoading(true);
    await supabase.from('orders').update({
      menu_name: null, drink_name: null, custom_menu: null, custom_drink: null, notes_food: null, notes_drink: null, source: 'MANUAL'
    }).eq('participant_id', pId).eq('order_date', date);
    fetchData();
  };

  const addParticipant = async (e) => {
    e.preventDefault();
    if (!newParticipant.name) return;
    await supabase.from('participants').insert([{...newParticipant, is_active: true}]);
    setNewParticipant({ name: '', role: 'management' });
    fetchData();
  };

  const deleteParticipant = async (id) => {
    if(!confirm('Yakin ingin menghapus peserta ini?')) return;
    await supabase.from('participants').delete().eq('id', id);
    fetchData();
  };

  const handleCustomDayToggle = (day) => {
    setNewMenu(prev => {
      const hasDay = prev.customDays.includes(day);
      return { ...prev, customDays: hasDay ? prev.customDays.filter(d => d !== day) : [...prev.customDays, day] };
    });
  };

  const startEditMenu = (menu) => {
    setEditingMenuId(menu.id);
    let dMode = 'custom'; let cDays = [];
    if (menu.available_days.includes('all')) { dMode = 'all'; }
    else if (menu.available_days.includes('idle')) { dMode = 'idle'; }
    else { cDays = menu.available_days; }

    setNewMenu({ 
      type: menu.type, name: menu.name, vendor_name: menu.vendor_name || '', 
      custom_vendor: '', visible_to: menu.visible_to || '', daysMode: dMode, 
      customDays: cDays, is_priority: menu.is_priority || false 
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditMenu = () => {
    setEditingMenuId(null);
    setNewMenu({ type: 'makanan', name: '', vendor_name: '', custom_vendor: '', visible_to: '', daysMode: 'all', customDays: [], is_priority: false });
  };

  const saveMenu = async (e) => {
    e.preventDefault();
    if (!newMenu.name) return;
    
    let finalDays = [];
    if (newMenu.daysMode === 'all') finalDays = ['all'];
    else if (newMenu.daysMode === 'idle') finalDays = ['idle'];
    else finalDays = newMenu.customDays;

    if (newMenu.daysMode === 'custom' && finalDays.length === 0) return alert('Silakan centang minimal satu hari!');
    
    let finalVendor = newMenu.vendor_name;
    if (finalVendor === '__custom__') {
      finalVendor = newMenu.custom_vendor.trim();
      if (!finalVendor) return alert('Nama restoran baru tidak boleh kosong!');
    }

    const payload = { 
      type: newMenu.type, name: newMenu.name, vendor_name: finalVendor, 
      visible_to: newMenu.visible_to, available_days: finalDays, 
      is_priority: newMenu.is_priority, is_active: true 
    };

    if (editingMenuId) await supabase.from('menus').update(payload).eq('id', editingMenuId);
    else await supabase.from('menus').insert([payload]);
    
    cancelEditMenu();
    fetchData();
  };

  const deleteMenu = async (id) => {
    if(!confirm('Yakin hapus menu ini?')) return;
    await supabase.from('menus').delete().eq('id', id);
    fetchData();
  };

  const uniqueVendors = [...new Set(menus.map(m => m.vendor_name).filter(Boolean))].sort();

  // Perbaikan Warna Badge Status Sesuai Permintaan
  const renderStatusBadge = (isAbsent, order) => {
    const hasOrder = order && (order.menu_name || order.drink_name || order.custom_menu);
    if (isAbsent) return <span className="badge bg-danger text-white rounded-pill px-2 py-1 me-2" style={{fontSize: '11px'}}>Tidak Hadir</span>;
    if (hasOrder) {
      if (order.source === 'AUTO') return <span className="badge bg-success text-white rounded-pill px-2 py-1 me-2" style={{fontSize: '11px'}}>Auto Pesan</span>;
      return <span className="badge bg-success bg-opacity-25 text-success border border-success border-opacity-25 rounded-pill px-2 py-1 me-2" style={{fontSize: '11px'}}>Sudah Pesan</span>;
    }
    return <span className="badge bg-danger bg-opacity-25 text-danger border border-danger border-opacity-25 rounded-pill px-2 py-1 me-2" style={{fontSize: '11px'}}>Belum Pesan</span>;
  };

  const groupMenusAdmin = (menuList) => {
    const groups = {};
    menuList.forEach(m => {
      const vendor = m.vendor_name || 'Umum (Tanpa Restoran)';
      if (!groups[vendor]) groups[vendor] = [];
      groups[vendor].push(m);
    });
    return groups;
  };

  const handleAddMenuForVendor = (vendorName, type) => {
    setNewMenu({ ...newMenu, type: type, vendor_name: vendorName === 'Umum (Tanpa Restoran)' ? '' : vendorName });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const groupedMakanan = groupMenusAdmin(menus.filter(m => m.type === 'makanan'));
  const groupedMinuman = groupMenusAdmin(menus.filter(m => m.type === 'minuman'));

  if (loading) return <div className="text-center mt-5">Memuat Dashboard...</div>;

  return (
    <div className="container py-4" style={{ maxWidth: '900px' }}>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold m-0"><i className="bi bi-gear-fill text-primary"></i> Admin Panel</h2>
        <div className="d-flex gap-2">
            <a href="/" className="btn btn-outline-secondary btn-sm">Halaman Depan</a>
            <button onClick={() => { localStorage.removeItem('isAdmin'); router.push('/login'); }} className="btn btn-danger btn-sm">Logout</button>
        </div>
      </div>

      <ul className="nav nav-pills mb-4 bg-light p-2 rounded-pill shadow-sm">
        <li className="nav-item"><button className={`nav-link rounded-pill ${activeTab === 'pengaturan' ? 'active' : ''}`} onClick={() => setActiveTab('pengaturan')}>Pengaturan</button></li>
        <li className="nav-item"><button className={`nav-link rounded-pill ${activeTab === 'edit-pesanan' ? 'active' : ''}`} onClick={() => setActiveTab('edit-pesanan')}>Edit Pesanan</button></li>
        <li className="nav-item"><button className={`nav-link rounded-pill ${activeTab === 'peserta' ? 'active' : ''}`} onClick={() => setActiveTab('peserta')}>Peserta</button></li>
        <li className="nav-item"><button className={`nav-link rounded-pill ${activeTab === 'menu' ? 'active' : ''}`} onClick={() => setActiveTab('menu')}>Menu</button></li>
      </ul>

      {activeTab === 'pengaturan' && (
        <div className="card p-4 shadow-sm border-0 rounded-4">
          <h5 className="mb-4 fw-bold text-dark">Kontrol Sistem</h5>
          <div className="row g-4 mb-4">
            <div className="col-md-6">
              <div className="p-3 bg-light rounded-4 h-100 d-flex flex-column justify-content-center">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <label className="form-check-label fw-bold text-dark">Kunci Otomatis (Lock)</label>
                  <div className="form-check form-switch m-0"><input className="form-check-input" style={{width: '3rem', height: '1.5rem', cursor: 'pointer'}} type="checkbox" checked={settings.lock_status === 'On'} onChange={handleToggleLock} /></div>
                </div>
                <div className="small text-muted">Jika 'On', form akan terkunci otomatis saat jam cut-off tiba.</div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="p-3 bg-light rounded-4 h-100 d-flex flex-column justify-content-center">
                <label className="form-label fw-bold text-dark mb-2">Jam Cut-Off (WIB)</label>
                <input type="time" className="form-control border-0 shadow-sm" value={settings.cutoff_time} onChange={e => setSettings({...settings, cutoff_time: e.target.value})}/>
              </div>
            </div>
          </div>
          <div className="text-end"><button onClick={saveSettings} className="btn btn-primary px-5 fw-bold rounded-pill shadow-sm"><i className="bi bi-save me-2"></i> Simpan Pengaturan</button></div>
        </div>
      )}

      {activeTab === 'edit-pesanan' && (
        <div className="card p-4 shadow-sm border-0 rounded-4">
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
                <div><h5 className="fw-bold m-0 text-dark">Edit & Reset Pesanan</h5><div className="text-muted small mt-1">Pilih tanggal untuk melihat dan mengelola pesanan masuk.</div></div>
                <div className="d-flex gap-2">
                  <input type="date" className="form-control border-0 bg-light fw-bold" value={date} onChange={e => setDate(e.target.value)} />
                  <button onClick={resetAllOrdersForDate} className="btn btn-danger text-nowrap rounded-pill fw-bold shadow-sm" disabled={orders.length === 0}><i className="bi bi-trash-fill me-1"></i> Reset Semua</button>
                </div>
            </div>

            <div className="table-responsive border rounded">
                <table className="table table-hover align-middle m-0 bg-white">
                    <thead className="table-light"><tr><th>Nama Peserta</th><th>Pesanan Sekarang</th><th className="text-end" style={{minWidth: '150px'}}>Aksi</th></tr></thead>
                    <tbody>
                        {participants.filter(p => p.is_active || orders.some(o => o.participant_id === p.id)).map(p => {
                            const currentOrder = orders.find(o => o.participant_id === p.id);
                            const isAbsent = absents.includes(p.id);
                            const isEditing = editingOrderId === p.id;
                            const hasOrder = currentOrder && (currentOrder.menu_name || currentOrder.drink_name || currentOrder.custom_menu);

                            return (
                                <tr key={p.id}>
                                    <td className="fw-bold text-dark">{p.name} {!p.is_active && <span className="badge bg-secondary ms-1" style={{fontSize: '9px'}}>Ad Hoc</span>}</td>
                                    <td>
                                        {isEditing ? (
                                            <div className="row g-2">
                                                <div className="col-12 col-md-6"><select className="form-select form-select-sm" value={editForm.menu_name} onChange={e=>setEditForm({...editForm, menu_name: e.target.value})}><option value="">Makanan...</option>{menus.filter(m=>m.type==='makanan').map(m=><option key={m.id} value={m.vendor_name ? `${m.name} @ ${m.vendor_name}` : m.name}>{m.name} {m.vendor_name ? `(${m.vendor_name})` : ''}</option>)}</select></div>
                                                <div className="col-12 col-md-6"><select className="form-select form-select-sm" value={editForm.drink_name} onChange={e=>setEditForm({...editForm, drink_name: e.target.value})}><option value="">Minuman...</option>{menus.filter(m=>m.type==='minuman').map(m=><option key={m.id} value={m.vendor_name ? `${m.name} @ ${m.vendor_name}` : m.name}>{m.name} {m.vendor_name ? `(${m.vendor_name})` : ''}</option>)}</select></div>
                                            </div>
                                        ) : (
                                            <div className="d-flex align-items-center">
                                                {renderStatusBadge(isAbsent, currentOrder)}
                                                <span className={`small ${hasOrder ? 'text-dark' : 'text-muted'}`}>
                                                    {!isAbsent ? (hasOrder ? `${currentOrder.menu_name || '-'} / ${currentOrder.drink_name || '-'}` : '') : ''}
                                                </span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="text-end">
                                        {isEditing ? (
                                            <button onClick={() => saveOrderAdmin(p.id)} className="btn btn-sm btn-success rounded-pill px-4 fw-bold shadow-sm">OK</button>
                                        ) : (
                                            <div className="d-flex justify-content-end gap-1">
                                                {hasOrder && (
                                                  <button onClick={() => resetParticipantOrder(p.id, p.name)} className="btn btn-sm btn-outline-danger rounded-circle border-0" title="Reset Pesanan"><i className="bi bi-arrow-counterclockwise fs-6"></i></button>
                                                )}
                                                <button onClick={() => startEditOrder(p.id, currentOrder)} className="btn btn-sm btn-outline-primary rounded-pill border-0 px-3 fw-bold bg-primary bg-opacity-10"><i className="bi bi-pencil"></i> Edit</button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {activeTab === 'peserta' && (
        <div className="card p-4 shadow-sm border-0 rounded-4 bg-white">
          <h5 className="mb-3 fw-bold">Kelola Peserta Tetap</h5>
          <form onSubmit={addParticipant} className="d-flex flex-wrap gap-2 mb-4 bg-light p-3 rounded border">
            <input type="text" className="form-control flex-fill border-0 shadow-sm" placeholder="Ketik Nama Peserta..." value={newParticipant.name} onChange={e => setNewParticipant({...newParticipant, name: e.target.value})} required />
            <select className="form-select border-0 shadow-sm" style={{ width: '160px' }} value={newParticipant.role} onChange={e => setNewParticipant({...newParticipant, role: e.target.value})}>
              <option value="management">Management</option><option value="director">Director</option>
            </select>
            <button type="submit" className="btn btn-success fw-bold px-4 rounded-pill shadow-sm"><i className="bi bi-plus-lg"></i> Tambah</button>
          </form>
          <div className="table-responsive border rounded">
            <table className="table table-hover align-middle m-0 bg-white">
              <thead className="table-light"><tr><th>Nama</th><th>Role</th><th className="text-end">Aksi</th></tr></thead>
              <tbody>
                {participants.filter(p => p.is_active).map(p => (
                  <tr key={p.id}><td className="fw-bold">{p.name}</td><td><span className={`badge ${p.role === 'director' ? 'bg-danger' : 'bg-primary'}`}>{p.role}</span></td><td className="text-end"><button onClick={() => deleteParticipant(p.id)} className="btn btn-sm btn-light text-danger border-0"><i className="bi bi-trash fs-5"></i></button></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'menu' && (
        <>
          <div className={`card p-4 shadow-sm border-0 rounded-4 mb-4 ${editingMenuId ? 'bg-warning bg-opacity-10 border border-warning' : 'bg-white'}`}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="fw-bold m-0">
                {editingMenuId ? <><i className="bi bi-pencil-square text-warning me-2"></i>Edit Menu</> : <><i className="bi bi-plus-circle-fill text-success me-2"></i>Tambah Menu Baru</>}
              </h5>
              {editingMenuId && <button onClick={cancelEditMenu} className="btn btn-sm btn-outline-secondary rounded-pill">Batal Edit</button>}
            </div>

            <form onSubmit={saveMenu}>
              <div className="row g-3 mb-3">
                <div className="col-md-2">
                  <label className="form-label small fw-bold text-muted">Tipe</label>
                  <select className="form-select border-0 shadow-sm bg-light" value={newMenu.type} onChange={e=>setNewMenu({...newMenu, type: e.target.value})}>
                    <option value="makanan">Makanan</option><option value="minuman">Minuman</option>
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-bold text-muted">Restoran / Tempat</label>
                  <select className="form-select mb-2 border-0 shadow-sm bg-light" value={newMenu.vendor_name} onChange={e=>setNewMenu({...newMenu, vendor_name: e.target.value})}>
                    <option value="">-- Tanpa Restoran (Umum) --</option>
                    {uniqueVendors.map(v => <option key={v} value={v}>{v}</option>)}
                    <option value="__custom__">+ Tambah Restoran Baru</option>
                  </select>
                  {newMenu.vendor_name === '__custom__' && <input type="text" className="form-control border-primary shadow-sm" placeholder="Ketik nama restoran baru..." value={newMenu.custom_vendor} onChange={e=>setNewMenu({...newMenu, custom_vendor: e.target.value})} required />}
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-bold text-muted">Nama Menu</label>
                  <input type="text" className="form-control border-0 shadow-sm bg-light" placeholder="Contoh: Soto Betawi" value={newMenu.name} onChange={e=>setNewMenu({...newMenu, name: e.target.value})} required />
                </div>
                <div className="col-md-2">
                  <label className="form-label small fw-bold text-muted">Akses</label>
                  <select className="form-select border-0 shadow-sm bg-light" value={newMenu.visible_to} onChange={e=>setNewMenu({...newMenu, visible_to: e.target.value})}>
                    <option value="">Semua</option><option value="management">Mgmt</option><option value="director">Dir</option>
                  </select>
                </div>
              </div>

              <div className="mb-3 p-3 bg-light rounded-4 border">
                <div className="d-flex justify-content-between align-items-center mb-2">
                    <label className="form-label small fw-bold text-muted m-0">Jadwal Ketersediaan</label>
                    <div className="form-check form-switch m-0">
                      <input className="form-check-input" type="checkbox" id="isPriority" checked={newMenu.is_priority} onChange={e => setNewMenu({...newMenu, is_priority: e.target.checked})} />
                      <label className="form-check-label small fw-bold text-warning" htmlFor="isPriority"><i className="bi bi-star-fill"></i> Jadikan Prioritas Mayoritas</label>
                    </div>
                </div>
                <div className="d-flex flex-wrap gap-3 mb-2">
                  <div className="form-check"><input className="form-check-input" type="radio" name="daysMode" id="modeAll" checked={newMenu.daysMode === 'all'} onChange={() => setNewMenu({...newMenu, daysMode: 'all'})} /><label className="form-check-label small fw-bold" htmlFor="modeAll">Tiap Hari (All)</label></div>
                  <div className="form-check"><input className="form-check-input" type="radio" name="daysMode" id="modeIdle" checked={newMenu.daysMode === 'idle'} onChange={() => setNewMenu({...newMenu, daysMode: 'idle'})} /><label className="form-check-label small fw-bold text-secondary" htmlFor="modeIdle">Menu Pengganti (Idle)</label></div>
                  <div className="form-check"><input className="form-check-input" type="radio" name="daysMode" id="modeCustom" checked={newMenu.daysMode === 'custom'} onChange={() => setNewMenu({...newMenu, daysMode: 'custom'})} /><label className="form-check-label small fw-bold text-primary" htmlFor="modeCustom">Pilih Hari Tertentu</label></div>
                </div>
                {newMenu.daysMode === 'custom' && (
                  <div className="d-flex flex-wrap gap-3 mt-3 pt-3 border-top">
                    {['senin', 'selasa', 'rabu', 'kamis', 'jumat'].map(day => (<div className="form-check m-0" key={day}><input className="form-check-input border-primary" type="checkbox" id={`day-${day}`} checked={newMenu.customDays.includes(day)} onChange={() => handleCustomDayToggle(day)} /><label className="form-check-label small text-capitalize" htmlFor={`day-${day}`}>{day}</label></div>))}
                  </div>
                )}
              </div>

              <div className="text-end">
                <button type="submit" className={`btn fw-bold px-5 rounded-pill shadow-sm ${editingMenuId ? 'btn-warning' : 'btn-success'}`}>
                  <i className="bi bi-save me-2"></i> {editingMenuId ? 'Update Menu' : 'Simpan Menu'}
                </button>
              </div>
            </form>
          </div>

          <div className="row g-4">
            <div className="col-12 col-lg-6">
               <div className="card shadow-sm border-0 rounded-4">
                 <div className="card-header bg-white border-bottom-0 pt-4 pb-2"><h5 className="fw-bold text-primary mb-0"><i className="bi bi-egg-fried me-2"></i>Daftar Makanan</h5></div>
                 <div className="card-body p-3">
                    {Object.entries(groupedMakanan).map(([vendor, items]) => (
                        <div key={vendor} className="mb-4">
                            <div className="d-flex justify-content-between align-items-center bg-primary bg-opacity-10 p-2 rounded-3 mb-2">
                                <span className="fw-bold text-dark px-2"><i className="bi bi-shop me-2 text-warning"></i>{vendor}</span>
                                <button onClick={() => handleAddMenuForVendor(vendor, 'makanan')} className="btn btn-sm btn-white border border-primary text-primary rounded-pill px-3 shadow-sm" style={{fontSize: '11px'}}>+ Tambah di sini</button>
                            </div>
                            <ul className="list-group list-group-flush border rounded-3 overflow-hidden">
                                {items.map((m, idx) => {
                                    const safeDays = Array.isArray(m.available_days) ? m.available_days : [];
                                    return (
                                        <li key={m.id} className="list-group-item d-flex justify-content-between align-items-center bg-white border-bottom">
                                            <div>
                                                <span className="me-2 text-muted fw-bold small">{idx + 1}.</span>
                                                <strong className="text-dark me-2">{m.name}</strong> 
                                                {m.is_priority && <i className="bi bi-star-fill text-warning me-2" title="Menu Prioritas Mayoritas"></i>}
                                                <span className="badge bg-light text-dark border me-1 text-capitalize">{safeDays.join(', ') || 'Semua'}</span>
                                                {m.visible_to && <span className="badge bg-secondary text-capitalize">{m.visible_to}</span>}
                                            </div>
                                            <div className="d-flex gap-1">
                                                <button onClick={()=>startEditMenu(m)} className="btn btn-sm btn-light text-primary rounded-circle border-0"><i className="bi bi-pencil"></i></button>
                                                <button onClick={()=>deleteMenu(m.id)} className="btn btn-sm btn-light text-danger rounded-circle border-0"><i className="bi bi-trash"></i></button>
                                            </div>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    ))}
                    {Object.keys(groupedMakanan).length === 0 && <div className="text-muted small text-center p-3 bg-light rounded">Belum ada makanan</div>}
                 </div>
               </div>
            </div>
            
            <div className="col-12 col-lg-6">
               <div className="card shadow-sm border-0 rounded-4">
                 <div className="card-header bg-white border-bottom-0 pt-4 pb-2"><h5 className="fw-bold text-info mb-0"><i className="bi bi-cup-straw me-2"></i>Daftar Minuman</h5></div>
                 <div className="card-body p-3">
                    {Object.entries(groupedMinuman).map(([vendor, items]) => (
                        <div key={vendor} className="mb-4">
                            <div className="d-flex justify-content-between align-items-center bg-info bg-opacity-10 p-2 rounded-3 mb-2">
                                <span className="fw-bold text-dark px-2"><i className="bi bi-shop me-2 text-warning"></i>{vendor}</span>
                                <button onClick={() => handleAddMenuForVendor(vendor, 'minuman')} className="btn btn-sm btn-white border border-info text-info rounded-pill px-3 shadow-sm" style={{fontSize: '11px'}}>+ Tambah di sini</button>
                            </div>
                            <ul className="list-group list-group-flush border rounded-3 overflow-hidden">
                                {items.map((m, idx) => {
                                    const safeDays = Array.isArray(m.available_days) ? m.available_days : [];
                                    return (
                                        <li key={m.id} className="list-group-item d-flex justify-content-between align-items-center bg-white border-bottom">
                                            <div>
                                                <span className="me-2 text-muted fw-bold small">{idx + 1}.</span>
                                                <strong className="text-dark me-2">{m.name}</strong> 
                                                {m.is_priority && <i className="bi bi-star-fill text-warning me-2" title="Menu Prioritas Mayoritas"></i>}
                                                <span className="badge bg-light text-dark border me-1 text-capitalize">{safeDays.join(', ') || 'Semua'}</span>
                                                {m.visible_to && <span className="badge bg-secondary text-capitalize">{m.visible_to}</span>}
                                            </div>
                                            <div className="d-flex gap-1">
                                                <button onClick={()=>startEditMenu(m)} className="btn btn-sm btn-light text-primary rounded-circle border-0"><i className="bi bi-pencil"></i></button>
                                                <button onClick={()=>deleteMenu(m.id)} className="btn btn-sm btn-light text-danger rounded-circle border-0"><i className="bi bi-trash"></i></button>
                                            </div>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    ))}
                    {Object.keys(groupedMinuman).length === 0 && <div className="text-muted small text-center p-3 bg-light rounded">Belum ada minuman</div>}
                 </div>
               </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}