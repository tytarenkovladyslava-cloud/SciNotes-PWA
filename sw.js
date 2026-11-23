const STATIC_CACHE = 'flashcards-static-v2';
const API_CACHE = 'flashcards-api-v2';
const FILES = ['./', './index.html', './style.css', './app.js', './manifest.json'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(FILES)));
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Для Dictionary API: спочатку мережа, при офлайні — кеш
    if (url.hostname === 'api.dictionaryapi.dev') {
        e.respondWith(
            fetch(e.request)
                .then((res) => {
                    const copy = res.clone();
                    caches.open(API_CACHE).then((cache) => cache.put(e.request, copy));
                    return res;
                })
                .catch(() => caches.match(e.request))
        );
        return;
    }

    e.respondWith(
        caches.match(e.request).then((cached) => cached || fetch(e.request))
    );
});