const CACHE_NAME = 'ayen-pos-v1.1'; // Update this version number to force a total wipe

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Forces the waiting service worker to become the active service worker
});

self.addEventListener('activate', (event) => {
  // Actively wipe out any old caches stored in the browser
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // 1. Ignore POST requests (like your API calls to Google Apps Script)
  if (event.request.method !== 'GET') {
    return;
  }

  // 2. Ignore cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // 3. Network-first strategy to ensure fresh files are fetched
  event.respondWith(
    fetch(event.request).catch((err) => {
      console.warn('Service Worker: Network request failed, falling back to cache if available', err);
      return caches.match(event.request);
    })
  );
});
