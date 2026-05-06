const CACHE_NAME = 'ayen-pos-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // We leave this mostly empty because we want the POS to always fetch live data,
  // but the file must exist for Chrome PWA requirements.
  event.respondWith(fetch(event.request));
});