const STATIC_CACHE = 'scinotes-static-v1';
const API_CACHE = 'scinotes-api-v1';

const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './db.js',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
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

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Стратегія Network First для Crossref API
    if (url.hostname === 'api.crossref.org') {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    const cloned = networkResponse.clone();
                    caches.open(API_CACHE).then((cache) => cache.put(event.request, cloned));
                    return networkResponse;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Стратегія Cache First для власної статики
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request);
        })
    );
});