// Работа без интернета (веб-версия): все файлы приложения кешируются при установке.
// FILES (файл -> отпечаток SHA-256) и CACHE подставляет publish.py при публикации.
// При обновлении неизменённые файлы (прежде всего текст ПДД, 0,4 МБ) переносятся из старого кеша,
// по сети качаются только изменённые. В сборке Android (Capacitor) не используется.
const FILES = {
 "./": "95b21bc48ba2851b",
 "index.html": "95b21bc48ba2851b",
 "style.css": "63a146d56825ef92",
 "app.js": "7dcc141dc4fe1ec2",
 "pdd.js": "50656b3a22d7ecf7",
 "version.js": "a4692e5c9bc9ee72",
 "manifest.webmanifest": "49d777149bce79f6",
 "icons/icon-180.png": "42a6229649c1a033",
 "icons/icon-192.png": "c6c730b4af2e78f1",
 "icons/icon-512.png": "d99d07c1290cde85",
 "fonts/roboto-condensed-cyrillic.woff2": "c4afc8bd4b188649",
 "fonts/roboto-condensed-latin.woff2": "543c03fff71d1b39",
 "fonts/literata-cyrillic.woff2": "39bb5c343c21e6a4",
 "fonts/literata-latin.woff2": "a60c193b55766b68",
 "img/02000001jpg.jpg": "f6bf5327ef985dc5",
 "img/02000002jpg.png": "f681b71d4122fc43",
 "img/02000003jpg.jpg": "64312b217cc908f6",
 "img/02000004jpg.jpg": "aa44fc7eef4de7a8",
 "img/02000005jpg.jpg": "6f5aa112833611d5",
 "img/02000006jpg.jpg": "464bced74502550c",
 "img/02000008jpg.jpg": "39801e41be02557b",
 "img/02000009jpg.jpg": "29b91af3b247b5ab",
 "img/0200000Ajpg.jpg": "d31ab16e00926775",
 "img/0200000Bjpg.jpg": "ef64452ff97d0269",
 "img/0200000Djpg.jpg": "b8cb17113a86c43d",
 "img/0200000Ejpg.jpg": "9c3259126e4f5685",
 "img/0200000Fjpg.jpg": "ed803be07de47488",
 "img/02000010jpg.jpg": "bb8f303f8b8b879b",
 "img/02000011jpg.jpg": "ec403ad520af0cfb",
 "img/02000012jpg.jpg": "63d45c1a13a0cf91",
 "img/02000014jpg.jpg": "d745e683b34d07ab",
 "img/02000016jpg.jpg": "a270920199dd1c08",
 "img/02000017jpg.jpg": "182fb11f16410971",
 "img/02000030jpg.jpg": "5cd0bc6b325ccb25",
 "img/0200003Ajpg.png": "42f1951336a64e60",
 "img/0200003Cjpg.png": "bd7496fc6c133e57",
 "img/0200003Djpg.png": "4b22d1a4f5ed7013",
 "img/0200003Ejpg.png": "f9dc94ce2f9c9bb2",
 "img/0200003Fjpg.png": "cde517bddecb9020",
 "img/02000040jpg.png": "21af94cb08b32b19",
 "img/02000042jpg.jpg": "a2a3c49ceda38def",
 "img/02000043jpg.jpg": "8f6cff0ee36bcd36",
 "img/02000044jpg.jpg": "7ce0739b2bfb09f8",
 "img/02000045jpg.png": "bac53366da97e5cb",
 "img/02000046jpg.png": "45b18cafcf664010",
 "img/02000047jpg.png": "eba8eb96ceebb69b",
 "img/0200004Ejpg.jpg": "836e4e9f533be9ab",
 "img/0300002Epng.png": "823aff9900eff084",
 "img/0600002Femz.png": "975a3c8451a91ba3",
 "img/06000037emz.png": "547f9d057e15a10d",
 "img/0600003Bemz.png": "4c07340d2802607a",
 "img/06000041emz.png": "f2b4eecf8ec3f0ab",
 "img/08000019wmz.png": "1a89469fd6c80784",
 "img/0800001Awmz.png": "a2f3cf65372bcb8c",
 "img/0800001Bwmz.png": "29654bee96d069d7",
 "img/0800001Cwmz.png": "f47281f9232a4345",
 "img/0800001Dwmz.png": "546b26fe3cd5d4b1",
 "img/0800001Ewmz.png": "e8c25b23696831cb",
 "img/0800001Fwmz.png": "6230d812bd6f656b",
 "img/08000020wmz.png": "d9920d2044b990fb",
 "img/08000021wmz.png": "7e6d577fee3a06a5",
 "img/08000022wmz.png": "6c3324b45ed17521",
 "img/08000023wmz.png": "1416ba9a0261b3ef",
 "img/08000024wmz.png": "ac93a3d4499a41c5",
 "img/08000025wmz.png": "1193e79c1a75995c",
 "img/08000026wmz.png": "9365726ed3989ca0",
 "img/08000027wmz.png": "b3e0133a4d402aa6",
 "img/08000028wmz.png": "19fdf0ba9e29a620",
 "img/08000029wmz.png": "59c799c4409ef52e",
 "img/0800002Awmz.png": "9bdfac997879349b",
 "img/0800002Bwmz.png": "7a7ec7e324c84819",
 "img/0800002Cwmz.png": "fbbf0d097705ae75",
 "img/0800002Dwmz.png": "cea39ff5b8fc5d20",
 "img/08000031wmz.png": "a5dbcc0300dee061",
 "img/08000032wmz.png": "07fc38f39791f762",
 "img/08000033wmz.png": "9fa5dc70fc62a516",
 "img/08000034wmz.png": "797dc6099799b54b",
 "img/08000035wmz.png": "42f40d042002a422",
 "img/08000036wmz.png": "b331eea24f869e9c",
 "img/08000038wmz.png": "f825e35597ef4878",
 "img/08000039wmz.png": "dbaa680365b4bcba",
 "img/0800004Cwmz.jpg": "15ec78af7444f86c",
 "img/0800004Dwmz.jpg": "2c03ceaa5cba87fc"
};
const CACHE = 'pdd-784193ab50';
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
