/* รับที่อยู่เครื่อง (push subscription) + ข้อมูลสรุปจากแอพ (เช็คชื่อ ห้องน้ำ ค้างงาน การตั้งค่า) แล้วเก็บไว้ให้ push-check ใช้ */
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import { json, verify, clip } from '../lib/common.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let b; try { b = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const me = await verify(b.idToken);
  if (!me || !['admin', 'teacher', 'viewer'].includes(me.role)) return json({ error: 'unauthorized' }, 401);
  const sub = b.sub;
  if (!sub || !sub.endpoint || !sub.keys) return json({ error: 'no sub' }, 400);
  const id = createHash('sha256').update(sub.endpoint).digest('hex').slice(0, 40);
  const store = getStore('subs');
  if (b.remove) { await store.delete(id); return json({ ok: true, removed: true }); }
  const old = (await store.get(id, { type: 'json' }).catch(() => null)) || {};
  const snap = b.snap || {}, c = b.cfg || {};
  const cfg = {};
  ['attOn', 'wcOn', 'mwOn', 'slOn', 'slOkOn', 'regOn'].forEach((k) => { if (typeof c[k] === 'boolean') cfg[k] = c[k]; });
  if (c.wcMin >= 1) cfg.wcMin = Math.min(120, +c.wcMin); if (c.mwN >= 1) cfg.mwN = Math.min(50, +c.mwN);
  const mw = b.mw && b.mw.n > 0 ? { n: +b.mw.n | 0, text: clip(b.mw.text, 200) } : null;
  await store.setJSON(id, { uid: me.uid, role: me.role, sub, cfg, mw, snap: { ...snap, t: Date.now() }, sent: old.sent || {} });
  /* ห้องน้ำ: เก็บรายการที่ยังไม่กลับไว้ส่วนกลาง (ครูทุกคนได้รับแจ้งเมื่อเกินเวลา) */
  const t = b.trips;
  if (t && me.role !== 'viewer') {
    const ts = getStore('trips');
    for (const tid of Object.keys(t.upsert || {}).slice(0, 50)) { const x = t.upsert[tid]; if (x && x.s > 0) await ts.setJSON(String(tid).slice(0, 60), { name: clip(x.name, 80), room: clip(x.room, 40), s: +x.s }); }
    for (const tid of (t.remove || []).slice(0, 50)) await ts.delete(String(tid).slice(0, 60));
  }
  return json({ ok: true });
};
