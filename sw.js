/* ตัวช่วยแจ้งเตือนของเช็คงาน ABDIA (ไม่แคชไฟล์ เพื่อให้ได้เวอร์ชันล่าสุดเสมอ) */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

/* ---- ที่เก็บข้อมูลเล็กๆ (IndexedDB) สำหรับเตือนเช็คชื่อตอนไม่ได้เปิดแอพ ---- */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('abdia-sw', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function kvGet(k) { const d = await idb(); return new Promise((res) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); }
async function kvSet(k, v) { const d = await idb(); return new Promise((res) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => res(); }); }

self.addEventListener('message', (e) => {
  const d = e.data && e.data.abdiaSnap;
  if (d) e.waitUntil(kvSet('snap', d));
});

const hhmm = (t) => { const p = String(t || '08:00').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); };
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

/* ทำงานเป็นระยะเมื่อเบราว์เซอร์อนุญาต (Android/Chrome ที่ติดตั้งแอพ) แม้ไม่ได้เปิดแอพ */
async function checkAttendance() {
  const snap = await kvGet('snap');
  if (!snap || !snap.on || !Array.isArray(snap.rooms)) return;
  const now = new Date(), today = ymd(now), wd = now.getDay(), nowM = now.getHours() * 60 + now.getMinutes();
  const sent = (await kvGet('sent')) || {};
  const due = [];
  for (const r of snap.rooms) {
    if (snap.date === today && r.done) continue;
    let key = null;
    if (r.sched && r.sched.length) {
      const en = r.sched.filter((e) => e.d.indexOf(wd) >= 0 && hhmm(e.t) <= nowM && nowM < 18 * 60);
      if (en.length) key = r.id + '|' + en[en.length - 1].t + '|' + today;
    } else if (wd >= 1 && wd <= 5 && now.getHours() >= (snap.attHour || 8) && now.getHours() < 17) key = r.id + '|d|' + today;
    if (key && !sent[key]) { sent[key] = 1; due.push(r); }
  }
  if (!due.length) return;
  for (const k of Object.keys(sent)) if (k.split('|')[2] !== today) delete sent[k];
  await kvSet('sent', sent);
  await self.registration.showNotification('📝 วันนี้ยังไม่เช็คชื่อน้าา (:', {
    body: 'ห้อง ' + due.map((r) => r.name).join(', ') + ' ยังไม่ได้เช็คชื่อ แตะเพื่อไปเช็คชื่อ',
    tag: 'att', renotify: true, icon: 'icon-192.png', badge: 'icon-192.png', vibrate: [200, 100, 200],
    data: { tab: 'attendance', roomId: due[0].id },
  });
}
self.addEventListener('periodicsync', (e) => { if (e.tag === 'abdia-att') e.waitUntil(checkAttendance().catch(() => {})); });

/* รับแจ้งเตือนจากเซิร์ฟเวอร์ (ทำงานแม้ปิดแอพ) */
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'เช็คงาน ABDIA', {
    body: d.body || '', tag: d.tag || ('p' + Date.now()), renotify: true, icon: 'icon-192.png', badge: 'icon-192.png',
    vibrate: [200, 100, 200], data: d.data || {},
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.postMessage({ abdiaOpen: data }); return c.focus(); } }
    return self.clients.openWindow('./');
  }));
});
