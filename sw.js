// Réseau d'abord pour recevoir les mises à jour, cache si hors connexion.
const CACHE = "inster-v14";
const FILES = ["./", "index.html", "app.css", "app.js", "cloud.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
  "fonts/saira-600.woff2", "fonts/atkinson-400.woff2", "fonts/atkinson-700.woff2"];

self.addEventListener("install", e => {
  // "reload" : ignore le cache HTTP de GitHub Pages (10 min), sinon on installe d'anciens fichiers.
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(FILES.map(u => fetch(u, { cache: "reload" }).then(r => { if (!r.ok) throw new Error(u); return c.put(u, r); }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== "firebase-sdk").map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // SDK Firebase : URL versionnée donc immuable, cache d'abord pour démarrer hors connexion.
  if (e.request.method === "GET" && url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    e.respondWith(caches.open("firebase-sdk").then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }))));
    return;
  }
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request.url, { cache: "no-cache" }).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })
      .then(r => r || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
