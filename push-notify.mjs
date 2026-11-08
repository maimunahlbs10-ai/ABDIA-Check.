/* แจ้งเตือนทันทีตามเหตุการณ์ (แม้ผู้รับปิดแอพอยู่): ส่งสไลด์ / ตรวจสไลด์ / หมายเหตุ / ครูสมัครใหม่ */
import { getStore } from '@netlify/blobs';
import { json, verify, initPush, send, allSubs, cfgOf, clip } from '../lib/common.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let b; try { b = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const me = await verify(b.idToken); if (!me) return json({ error: 'unauthorized' }, 401);
  if (!initPush()) return json({ error: 'no keys' }, 500);
  const d = b.data || {}, type = b.type, store = getStore('subs'), subs = await allSubs(store);
  const where = clip(d.room, 40) + ' · ' + clip(d.subject, 60) + ' · ' + clip(d.title, 100);
  let targets = [], payload = null;
  if (type === 'slide-new' && ['admin', 'teacher'].includes(me.role)) {
    targets = subs.filter((s) => s.rec.role === 'admin' && cfgOf(s.rec).slOn);
    payload = { title: '📎 มีสไลด์มาส่งจ้าาาา !(:', body: (me.name || 'ครู') + ' ส่ง ' + where + ' แตะเพื่อไปตรวจน้า', tag: 'slnew', data: { tab: 'slides', slTab: 'review' } };
  } else if ((type === 'slide-ok' || type === 'slide-cm') && me.role === 'admin') {
    targets = subs.filter((s) => s.rec.uid === d.to && cfgOf(s.rec).slOkOn);
    const rc = d.rc ? ' 💬 ' + clip(d.rc, 200) : '';
    payload = type === 'slide-ok'
      ? { title: '✓ ตรวจเรียบร้อยแล้วน้าา !(:', body: where + ' (โดย ' + (me.name || 'ผู้ตรวจ') + ')' + rc, tag: 'slok', data: { tab: 'slides', slTab: 'list' } }
      : { title: '💬 มีหมายเหตุสไลด์มาจ้าา !(:', body: where + rc, tag: 'slok', data: { tab: 'slides', slTab: 'list' } };
  } else if (type === 'reg' && me.role === 'pending') {
    const ms = getStore('meta'), k = 'reg-' + me.uid, last = await ms.get(k).catch(() => null);
    if (last && Date.now() - +last < 12 * 3600 * 1000) return json({ ok: true, skipped: true });
    await ms.set(k, String(Date.now()));
    targets = subs.filter((s) => s.rec.role === 'admin' && cfgOf(s.rec).regOn);
    payload = { title: '👩‍🏫 มีครูสมัครใหม่จ้า !(:', body: (me.name || 'ครูใหม่') + ' รออนุมัติ กดเพื่อไปหน้าตั้งค่า', tag: 'reg', data: { tab: 'settings' } };
  } else return json({ error: 'not allowed' }, 403);
  let n = 0; for (const t of targets) if (await send(store, t.key, t.rec, payload)) n++;
  return json({ ok: true, sent: n });
};
