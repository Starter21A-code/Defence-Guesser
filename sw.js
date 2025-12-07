// Defence Guesser Service Worker
const CACHE_NAME = 'defence-guesser-v1';

// Files to cache for offline use
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './data.js',
    './assets/geo-data.js',
    './manifest.json',
    // Add your local asset images here
    './assets/m1_abrams_1765118350420.png',
    './assets/leopard2_1765118389229.png',
    './assets/challenger2_1765118413349.png',
    './assets/t90_1765118367473.png',
    './assets/merkava4_1765118431134.png',
    './assets/type99a_tank.png',
    './assets/k2_black_panther.png',
    './assets/pokpung_ho.png',
    './assets/zulfiqar_3.png',
    './assets/arjun_mk2.png',
    './assets/leclerc.png',
    './assets/type_10.png',
    './assets/f35_1765118455699.png',
    './assets/gripen_1765118486549.png',
    './assets/f22_raptor.png',
    './assets/su57_felon.png',
    './assets/uss_ford_carrier.png',
    './assets/s400_1765118527696.png',
    './assets/caesar_1765118550941.png',
    './assets/bayraktar_1765118506987.png',
    './assets/m4a1_carbine.png',
    './assets/ak74m_rifle.png',
    './assets/icon-96.png',
    './assets/icon-192.png',
    './assets/icon-512.png'
];

// Install event - cache files
self.addEventListener('install', event => {
    console.log('[SW] Installing Service Worker...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching app shell...');
                // Cache what we can, don't fail if some assets are missing
                return Promise.allSettled(
                    urlsToCache.map(url =>
                        cache.add(url).catch(err => {
                            console.warn(`[SW] Failed to cache: ${url}`, err);
                        })
                    )
                );
            })
            .then(() => {
                console.log('[SW] Install complete');
                return self.skipWaiting();
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('[SW] Activating Service Worker...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Activation complete');
            return self.clients.claim();
        })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip external URLs (like map tiles, external images)
    const url = new URL(event.request.url);
    if (url.origin !== location.origin) {
        // For external resources, try network first, then cache
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Cache external resources for offline use
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // For local resources, try cache first, then network
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    // Found in cache
                    return response;
                }

                // Not in cache, fetch from network
                return fetch(event.request)
                    .then(response => {
                        // Don't cache non-successful responses
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Clone the response
                        const responseToCache = response.clone();

                        // Add to cache
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    });
            })
    );
});

// Handle messages from the app
self.addEventListener('message', event => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
