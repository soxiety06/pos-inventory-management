const CACHE_NAME = 'ayen-pos-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
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

  // 3. Safely pass through local GET requests (HTML, CSS, images)
  event.respondWith(
    fetch(event.request).catch((err) => {
      console.warn('Service Worker: Network request failed', err);
    })
  );
});
