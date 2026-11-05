// Работа без интернета (веб-версия): все файлы приложения кешируются при установке.
// FILES (файл -> отпечаток SHA-256) и CACHE подставляет publish.py при публикации.
// При обновлении неизменённые файлы (прежде всего текст ПДД, 0,4 МБ) переносятся из старого кеша,
// по сети качаются только изменённые. В сборке Android (Capacitor) не используется.
const FILES = {
 "./": "4e8406a5787274b0",
 "index.html": "4e8406a5787274b0",
 "style.css": "f6024a29b02d612d",
 "app.js": "13988cbaa11a8c3e",
 "pdd.js": "aef187b5af5772ae",
 "version.js": "c1c416671eeb6b69",
 "manifest.webmanifest": "49d777149bce79f6",
 "icons/icon-180.png": "42778c9c1d0b5e82",
 "icons/icon-192.png": "60c89dddbd07e635",
 "icons/icon-512.png": "c6ac8f5f46514502",
 "fonts/roboto-condensed-cyrillic.woff2": "c4afc8bd4b188649",
 "fonts/roboto-condensed-latin.woff2": "543c03fff71d1b39",
 "fonts/literata-cyrillic.woff2": "39bb5c343c21e6a4",
 "fonts/literata-latin.woff2": "a60c193b55766b68"
};
const CACHE = 'pdd-fb044e9dbd';
const META = '__hashes';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const old = [];
    for (const key of await caches.keys()) {
      if (key === CACHE) continue;
      const c = await caches.open(key);
      const meta = await c.match(META);
      if (meta) old.push({ c, hashes: await meta.json() });
    }
    await Promise.all(Object.entries(FILES).map(async ([file, hash]) => {
      let r = null;
      if (hash) {
        for (const o of old) {
          if (o.hashes[file] === hash && (r = await o.c.match(file))) break;
        }
      }
      if (!r) {
        r = await fetch(new Request(file, { cache: 'reload' }));
        if (!r.ok) throw new Error(file + ': ' + r.status);
      }
      await cache.put(file, r);
    }));
    await cache.put(META, new Response(JSON.stringify(FILES)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
