import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function POST(req) {
  const { date } = await req.json();

  try {
    const { data: participants } = await supabase.from('participants').select('*');
    const { data: absents } = await supabase.from('attendance').select('*').eq('attendance_date', date).eq('is_absent', true);
    const { data: menus } = await supabase.from('menus').select('*');
    
    // Tarik pesanan dan urutkan berdasarkan waktu pembuatan (created_at) untuk logika "Siapa Cepat"
    const { data: orders } = await supabase.from('orders').select('*').eq('order_date', date).order('created_at', { ascending: true });

    const nonDirectorOrders = (orders || []).filter(o => {
      const p = participants.find(x => x.id === o.participant_id);
      return p && p.role !== 'director' && (o.menu_name || o.drink_name);
    });

    if (nonDirectorOrders.length === 0) return NextResponse.json({ success: true, message: 'Tidak ada pesanan acuan.' });

    // FUNGSI CERDAS PENENTU MAYORITAS
    const getMajority = (type) => {
      const counts = {};
      const firstSeen = {};
      
      nonDirectorOrders.forEach((o, index) => {
        const val = type === 'makanan' ? o.menu_name : o.drink_name;
        if (!val) return;
        
        if (!counts[val]) {
          counts[val] = 0;
          firstSeen[val] = index; // Mencatat siapa yang dipesan paling duluan
        }
        counts[val]++;
      });

      let maxCount = 0;
      let candidates = [];
      
      // 1. Cari jumlah terbanyak
      for (const [name, count] of Object.entries(counts)) {
        if (count > maxCount) {
          maxCount = count;
          candidates = [name];
        } else if (count === maxCount) {
          candidates.push(name);
        }
      }

      if (candidates.length === 0) return '';
      if (candidates.length === 1) return candidates[0];

      // 2. TIE-BREAKER 1: Cek Tag Prioritas
      const priorityCandidates = candidates.filter(c => {
         const m = menus.find(x => (x.vendor_name ? `${x.name} @ ${x.vendor_name}` : x.name) === c);
         return m && m.is_priority;
      });

      const finalCandidates = priorityCandidates.length > 0 ? priorityCandidates : candidates;
      
      // 3. TIE-BREAKER 2: Siapa yang dipesan lebih dulu
      finalCandidates.sort((a, b) => firstSeen[a] - firstSeen[b]);
      
      return finalCandidates[0];
    };

    const majFood = getMajority('makanan');
    const majDrink = getMajority('minuman');

    if (!majFood && !majDrink) return NextResponse.json({ success: true });

    const targets = participants.filter(p => {
      if (p.role === 'director') return false;
      if (!p.is_active) return false;
      if (absents.some(a => a.participant_id === p.id)) return false;
      if (orders.some(o => o.participant_id === p.id && (o.menu_name || o.drink_name))) return false;
      return true;
    });

    const upserts = targets.map(t => ({
      participant_id: t.id, order_date: date, menu_name: majFood, drink_name: majDrink, source: 'AUTO'
    }));

    if (upserts.length > 0) await supabase.from('orders').upsert(upserts, { onConflict: 'participant_id, order_date' });

    return NextResponse.json({ success: true, autofilled: upserts.length });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}