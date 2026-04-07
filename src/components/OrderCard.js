'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

function getDayNameID(dateStr) {
  if (!dateStr) return '';
  const days = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return days[d.getDay()];
}

function filterOptionsByRoleAndDate(options, role, dateStr) {
  const day = getDayNameID(dateStr);
  const roleLc = (role || '').trim().toLowerCase();
  const isDirector = (roleLc === 'director');

  const busyDays = new Set();
  (options || []).forEach(o => {
    const itemDays = o.available_days || [];
    itemDays.forEach(d => {
      const lowerD = d.toLowerCase();
      if (!['all', 'allday', 'setiap hari', 'idle'].includes(lowerD)) busyDays.add(lowerD);
    });
  });

  return (options || []).filter(o => {
    const vTo = (o.visible_to || '').toLowerCase();
    const roleOK = isDirector ? true : (vTo === 'management' || vTo === '');
    if (!roleOK) return false;
    if (isDirector) return true;

    const itemDays = o.available_days || [];
    if (itemDays.length === 0) return false;
    if (itemDays.some(d => ['all', 'allday', 'setiap hari'].includes(d.toLowerCase()))) return true;
    if (itemDays.some(d => d.toLowerCase() === 'idle')) return !busyDays.has(day);
    
    return itemDays.map(d => d.toLowerCase()).includes(day);
  });
}

const groupMenus = (menuList) => {
  const groups = {};
  menuList.forEach(m => {
    const vendor = m.vendor_name || 'Umum';
    if (!groups[vendor]) groups[vendor] = [];
    groups[vendor].push(m);
  });
  return groups;
};

export default function OrderCard({ p, date, menus, isLocked, existingOrder, existingAbsent, onRefresh, onAbsentChange, globalCollapsed }) {
  const [order, setOrder] = useState({ menu_name: '', drink_name: '', custom_menu: '', custom_drink: '', notes_food: '', notes_drink: '' });
  const [isAbsent, setIsAbsent] = useState(false);
  const [isEditing, setIsEditing] = useState(false); 
  const [isCollapsed, setIsCollapsed] = useState(false); 
  
  const [nameEditing, setNameEditing] = useState(false);
  const [tempName, setTempName] = useState(p.name);
  const [loading, setLoading] = useState(false);

  useEffect(() => setIsCollapsed(globalCollapsed), [globalCollapsed]);

  useEffect(() => {
    if (existingOrder && (existingOrder.menu_name || existingOrder.drink_name || existingOrder.custom_menu)) {
      setOrder({
        menu_name: existingOrder.menu_name || '', drink_name: existingOrder.drink_name || '',
        custom_menu: existingOrder.custom_menu || '', custom_drink: existingOrder.custom_drink || '',
        notes_food: existingOrder.notes_food || '', notes_drink: existingOrder.notes_drink || '',
      });
      setIsEditing(false); 
    } else {
      setOrder({ menu_name: '', drink_name: '', custom_menu: '', custom_drink: '', notes_food: '', notes_drink: '' });
      setIsEditing(true); 
    }
    setIsAbsent(existingAbsent);
    if (existingAbsent) setIsCollapsed(true);
  }, [existingOrder, existingAbsent, date]);

  const makananFiltered = filterOptionsByRoleAndDate(menus.filter(m => m.type === 'makanan'), p.role, date);
  const minumanFiltered = filterOptionsByRoleAndDate(menus.filter(m => m.type === 'minuman'), p.role, date);
  const allowCustom = (p.role === 'director');

  const groupedMakanan = groupMenus(makananFiltered);
  const groupedMinuman = groupMenus(minumanFiltered);

  const handleSave = async () => {
    if (!order.menu_name && !order.drink_name) return alert('Pilih menu atau minuman!');
    if (order.menu_name === '__custom__' && !order.custom_menu) return alert('Isi makanan custom!');
    if (order.drink_name === '__custom__' && !order.custom_drink) return alert('Isi minuman custom!');

    setLoading(true);
    const payload = {
      participant_id: p.id, order_date: date,
      menu_name: order.menu_name, drink_name: order.drink_name,
      custom_menu: order.menu_name === '__custom__' ? order.custom_menu : null,
      custom_drink: order.drink_name === '__custom__' ? order.custom_drink : null,
      notes_food: order.notes_food, notes_drink: order.notes_drink,
      source: 'MANUAL'
    };

    const { error } = await supabase.from('orders').upsert(payload, { onConflict: 'participant_id, order_date' });
    if (error) alert('Gagal menyimpan pesanan: ' + error.message);
    else { setIsEditing(false); onRefresh(); }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!confirm('Hapus pesanan ini?')) return;
    setLoading(true);
    await supabase.from('orders').update({
      menu_name: null, drink_name: null, custom_menu: null, custom_drink: null, notes_food: null, notes_drink: null, source: 'MANUAL'
    }).eq('participant_id', p.id).eq('order_date', date);
    onRefresh();
    setLoading(false);
  };

  const toggleAbsent = async (e) => {
    e.stopPropagation();
    if (isLocked && p.role !== 'director') return;
    const nextState = !isAbsent;
    setIsAbsent(nextState);
    if (nextState) setIsCollapsed(true);
    if (onAbsentChange) onAbsentChange(p.id, nextState);
    await supabase.from('attendance').upsert({ participant_id: p.id, attendance_date: date, is_absent: nextState }, { onConflict: 'participant_id, attendance_date' });
  };

  const handleSaveName = async () => {
    if (!tempName.trim()) return;
    setLoading(true);
    await supabase.from('participants').update({ name: tempName }).eq('id', p.id);
    setNameEditing(false);
    onRefresh();
    setLoading(false);
  };

  const deleteGuest = async (e) => {
    e.stopPropagation();
    if(!confirm(`Hapus tamu "${p.name}" sepenuhnya dari database?`)) return;
    await supabase.from('participants').delete().eq('id', p.id);
    onRefresh();
  };

  const getStatusBadge = () => {
    if (isAbsent) {
      return <span className="badge rounded-pill px-3 py-1 bg-danger text-white shadow-sm" style={{fontSize: '11px'}}>Tidak Hadir</span>;
    }
    if (existingOrder && (existingOrder.menu_name || existingOrder.drink_name || existingOrder.custom_menu)) {
      if (existingOrder.source === 'AUTO') {
        return <span className="badge rounded-pill px-3 py-1 bg-success text-white shadow-sm" style={{fontSize: '11px'}}>Auto Pesan</span>;
      }
      return <span className="badge rounded-pill px-3 py-1 shadow-sm" style={{fontSize: '11px', backgroundColor: '#d1e7dd', color: '#0f5132', border: '1px solid #a3cfbb'}}>Sudah Pesan</span>;
    }
    return <span className="badge rounded-pill px-3 py-1 shadow-sm" style={{fontSize: '11px', backgroundColor: '#f8d7da', color: '#842029', border: '1px solid #f1aeb5'}}>Belum Pesan</span>;
  };

  const finalFood = existingOrder?.menu_name === '__custom__' ? existingOrder?.custom_menu : existingOrder?.menu_name;
  const finalDrink = existingOrder?.drink_name === '__custom__' ? existingOrder?.custom_drink : existingOrder?.drink_name;

  return (
    <div className={`card border-0 mb-2 ${isAbsent ? 'opacity-50' : 'shadow-sm'} ${isLocked && p.role !== 'director' ? 'bg-secondary bg-opacity-10' : 'bg-white'}`} style={{ borderRadius: '12px', transition: 'all 0.2s' }}>
      <div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-center" style={{ cursor: 'pointer' }} onClick={() => !isAbsent && setIsCollapsed(!isCollapsed)}>
          <div className="d-flex align-items-center gap-2 flex-grow-1">
            <i className="bi bi-chevron-down text-muted" style={{ transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}></i>
            
            <div className="d-flex align-items-center flex-wrap gap-1">
              {!p.is_active && nameEditing ? (
                <div className="d-flex gap-1" onClick={e => e.stopPropagation()}>
                  <input type="text" className="form-control form-control-sm" value={tempName} onChange={e => setTempName(e.target.value)} autoFocus disabled={isLocked && p.role !== 'director'} />
                  <button onClick={handleSaveName} disabled={isLocked && p.role !== 'director'} className="btn btn-sm btn-light border"><i className="bi bi-check-lg text-success"></i></button>
                </div>
              ) : (
                <span className="fw-bold text-dark">{p.name}</span>
              )}
              
              {/* PERBAIKAN: SEMBUNYIKAN TOMBOL EDIT NAMA SAAT LOCKED */}
              {!p.is_active && !nameEditing && (!isLocked || p.role === 'director') && (
                <button onClick={(e) => { e.stopPropagation(); setNameEditing(true); }} className="btn btn-sm btn-link text-secondary p-0 ms-1"><i className="bi bi-pencil" style={{fontSize:'12px'}}></i></button>
              )}

              <button onClick={toggleAbsent} disabled={isLocked && p.role !== 'director'} className="btn btn-sm border-0 bg-transparent ms-1 p-0 position-relative">
                <i className={`bi ${isAbsent ? 'bi-person-x-fill text-danger' : 'bi-person-fill text-success'} fs-5`}></i>
              </button>

              {/* PERBAIKAN: SEMBUNYIKAN TOMBOL HAPUS TAMU SAAT LOCKED */}
              {!p.is_active && (!isLocked || p.role === 'director') && (
                <button onClick={deleteGuest} className="btn btn-sm btn-link text-danger p-0 ms-1" title="Hapus Tamu Permanen"><i className="bi bi-x-lg"></i></button>
              )}
            </div>
          </div>
          <div>{getStatusBadge()}</div>
        </div>

        {!isAbsent && !isCollapsed && (
          <div className="mt-3 pt-3 border-top">
            {(!isEditing && existingOrder && (existingOrder.menu_name || existingOrder.drink_name || existingOrder.custom_menu)) ? (
              <div className="bg-light p-3 rounded-3 border d-flex justify-content-between align-items-center">
                <div style={{ fontSize: '13px' }}>
                  <div className="mb-1"><strong className="text-dark">Mkn:</strong> {finalFood || '-'} {existingOrder.notes_food && <span className="text-muted">({existingOrder.notes_food})</span>}</div>
                  <div><strong className="text-dark">Min:</strong> {finalDrink || '-'} {existingOrder.notes_drink && <span className="text-muted">({existingOrder.notes_drink})</span>}</div>
                </div>
                <div className="d-flex gap-2">
                  <button onClick={() => setIsEditing(true)} disabled={isLocked && p.role !== 'director'} className="btn btn-sm btn-outline-secondary rounded-circle"><i className="bi bi-pencil"></i></button>
                  <button onClick={handleDelete} disabled={isLocked && p.role !== 'director'} className="btn btn-sm btn-outline-danger rounded-circle" title="Reset Pesanan"><i className="bi bi-trash"></i></button>
                </div>
              </div>
            ) : (
              <div>
                <div className="row g-2 mb-3">
                  <div className="col-12 col-md-6">
                    <label className="form-label small fw-bold text-muted mb-1">Makanan</label>
                    <select className="form-select form-select-sm mb-2 bg-light border-0" disabled={isLocked && p.role !== 'director'} value={order.menu_name} onChange={e => setOrder({...order, menu_name: e.target.value})}>
                      <option value="">Pilih Makanan...</option>
                      {Object.keys(groupedMakanan).map(vendor => (
                        <optgroup key={vendor} label={vendor}>
                          {groupedMakanan[vendor].map(m => {
                            const val = m.vendor_name ? `${m.name} @ ${m.vendor_name}` : m.name;
                            return <option key={m.id} value={val}>{m.name}</option>;
                          })}
                        </optgroup>
                      ))}
                      {allowCustom && <option value="__custom__">*Custom (Tulis Manual)</option>}
                    </select>
                    {order.menu_name === '__custom__' && <input type="text" className="form-control form-control-sm mb-2 border-warning" placeholder="Isi makanan custom..." value={order.custom_menu} onChange={e => setOrder({...order, custom_menu: e.target.value})} />}
                    {order.menu_name && <input type="text" className="form-control form-control-sm bg-light border-0" placeholder="Keterangan (opsional)" value={order.notes_food} onChange={e => setOrder({...order, notes_food: e.target.value})} disabled={isLocked && p.role !== 'director'} />}
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label small fw-bold text-muted mb-1">Minuman</label>
                    <select className="form-select form-select-sm mb-2 bg-light border-0" disabled={isLocked && p.role !== 'director'} value={order.drink_name} onChange={e => setOrder({...order, drink_name: e.target.value})}>
                      <option value="">Pilih Minuman...</option>
                      {Object.keys(groupedMinuman).map(vendor => (
                        <optgroup key={vendor} label={vendor}>
                          {groupedMinuman[vendor].map(m => {
                            const val = m.vendor_name ? `${m.name} @ ${m.vendor_name}` : m.name;
                            return <option key={m.id} value={val}>{m.name}</option>;
                          })}
                        </optgroup>
                      ))}
                      {allowCustom && <option value="__custom__">*Custom (Tulis Manual)</option>}
                    </select>
                    {order.drink_name === '__custom__' && <input type="text" className="form-control form-control-sm mb-2 border-warning" placeholder="Isi minuman custom..." value={order.custom_drink} onChange={e => setOrder({...order, custom_drink: e.target.value})} />}
                    {order.drink_name && <input type="text" className="form-control form-control-sm bg-light border-0" placeholder="Keterangan (opsional)" value={order.notes_drink} onChange={e => setOrder({...order, notes_drink: e.target.value})} disabled={isLocked && p.role !== 'director'} />}
                  </div>
                </div>

                <div className="d-flex gap-2">
                  {(existingOrder && (existingOrder.menu_name || existingOrder.drink_name)) && <button onClick={() => setIsEditing(false)} className="btn btn-sm btn-light border rounded-pill px-4">Batal</button>}
                  <button onClick={handleSave} disabled={loading || (isLocked && p.role !== 'director')} className="btn btn-primary btn-sm rounded-pill px-4 fw-bold">
                    {loading ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}