// Service worker mínimo: cachea el "shell" de la app (HTML/CSS/JS/íconos)
// para que abra rápido e instale bien como PWA. Los datos de la API NUNCA
// se cachean acá a propósito: siempre tienen que pedirse frescos a la red.
const CACHE_NAME = "rio-widget-shell-v1";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // No interceptar llamadas a la API de INA: siempre red, nunca caché.
  if (url.hostname.includes("alerta.ina.gob.ar")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
