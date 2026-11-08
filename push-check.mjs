/* ทำงานทุก 2 นาที: เช็คชื่อ / ห้องน้ำนานเกินเวลา / ค้างงาน แล้วส่งแจ้งเตือนไปที่เครื่อง (แม้ปิดแอพ) */
import { getStore } from '@netlify/blobs';
import { initPush, send, allSubs, cfgOf, bangkokNow } from '../lib/common.mjs';

export const config = { schedule: '*/2 * * * *' };
const hhmm = (t) => { const p = String(t || '08:00').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); };

export default async () => {
  if (!initPush()) return;
  const store = getStore('subs'), ts = getStore('trips'), n = bangkokNow(), now = Date.now();
  /* ห้องน้ำ: อ่านรายการที่ยังไม่กลับ (ลบรายการเก่าเกิน 4 ชม.) */
  const trips = []; try { const { blobs } = await ts.list(); for (const { key } of blobs) { const t = await ts.get(key, { type: 'json' }).catch(() => null); if (!t) continue; if (now - t.s > 4 * 3600 * 1000) { await ts.delete(key); continue; } trips.push({ id: key, ...t }); } } catch (e) { console.log('trips', String(e)); }
  for (const { key, rec } of await allSubs(store)) {
    try {
      const cfg = cfgOf(rec), snap = rec.snap || {}, sent = rec.sent || {};
      /* แอพเปิดอยู่ แอพจะแจ้งเองอยู่แล้ว */
      if (now - (snap.t || 0) < 4 * 60000) continue;
      let changed = false; const out = [];
      /* เช็คชื่อ */
      if (cfg.attOn && snap.on && Array.isArray(snap.rooms)) {
        const due = [];
        for (const r of snap.rooms) {
          if (snap.date === n.today && r.done) continue;
          let k = null;
          if (r.sched && r.sched.length) { const en = r.sched.filter((e) => e.d.indexOf(n.wd) >= 0 && hhmm(e.t) <= n.nowM && n.nowM < 18 * 60); if (en.length) k = 'a|' + r.id + '|' + en[en.length - 1].t + '|' + n.today; }
          else if (n.wd >= 1 && n.wd <= 5 && n.hour >= (snap.attHour || 8) && n.hour < 17) k = 'a|' + r.id + '|d|' + n.today;
          if (k && !sent[k]) { sent[k] = 1; due.push(r); changed = true; }
        }
        if (due.length) out.push({ title: '📝 วันนี้ยังไม่เช็คชื่อน้าา (:', body: 'ห้อง ' + due.map((r) => r.name).join(', ') + ' ยังไม่ได้เช็คชื่อ แตะเพื่อไปเช็คชื่อ', tag: 'att', data: { tab: 'attendance', roomId: due[0].id } });
      }
      /* ห้องน้ำนานเกินกำหนด (ครูและผู้ดูแลทุกคนที่เปิดการแจ้งเตือนนี้) */
      if (cfg.wcOn && rec.role !== 'viewer') {
        for (const t of trips) {
          const k = 'w|' + t.id; if (sent[k] || now - t.s < cfg.wcMin * 60000) continue;
          sent[k] = 1; changed = true;
          out.push({ title: '🚻 ไปห้องน้ำนานแล้วน้า !(:', body: t.name + ' (ห้อง ' + t.room + ') ออกไปเกิน ' + cfg.wcMin + ' นาทีแล้ว', tag: 'wc-' + t.id, data: { tab: 'wc' } });
        }
      }
      /* ค้างงาน: สรุปวันละครั้ง จากข้อมูลล่าสุดที่แอพส่งมา */
      if (cfg.mwOn && rec.mw && rec.mw.n > 0 && n.wd >= 1 && n.wd <= 5 && n.hour >= (snap.attHour || 8) && n.hour < 17) {
        const k = 'm|' + n.today; if (!sent[k]) { sent[k] = 1; changed = true; out.push({ title: '📚 นักเรียนค้างงานน้า !(:', body: rec.mw.text, tag: 'mw', data: { tab: 'check', mode: 'summary' } }); }
      }
      if (!changed) continue;
      for (const k of Object.keys(sent)) { const p = k.split('|'); if ((p[0] === 'a' || p[0] === 'm') && p[p.length - 1] !== n.today) delete sent[k]; }
      for (const msg of out) await send(store, key, rec, msg);
      await store.setJSON(key, { ...rec, sent });
    } catch (e) { console.log('err', String(e)); }
  }
};
