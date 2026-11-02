// Offline support: after one successful visit the portfolio opens without a network connection.
const CACHE = "viswa-city-v3";
const PRECACHE = ["/", "/favicon.svg", "/viswa-avatar.png", "/resume.pdf", "/fonts/Poppins-Bold.ttf", "/textures/asphalt-diffuse.jpg", "/textures/asphalt-normal.jpg", "/textures/asphalt-roughness.jpg", "/textures/facade-normal.jpg", "/textures/facade-roughness.jpg"];

self.addEventListener("install", (event) => {
  // Cache each file on its own so one missing optional file cannot block installation.
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const isPage = request.mode === "navigate";
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (isPage) {
      // Pages: newest version when online, cached copy when offline.
      try {
        const fresh = await fetch(request);
        cache.put("/", fresh.clone());
        return fresh;
      } catch {
        return (await cache.match("/")) || Response.error();
      }
    }
    // Everything else (hashed JS/CSS, textures, fonts, images): cached copy first, then fetch and remember.
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch {
      return Response.error();
    }
  })());
});
