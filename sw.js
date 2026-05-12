// BARMASTER Service Worker - Cache Offline y Performance
const CACHE_NAME = 'barmaster-v1.0.3';
const STATIC_CACHE = 'barmaster-static-v1.0.3';
const DYNAMIC_CACHE = 'barmaster-dynamic-v1.0.3';

// Recursos críticos para cache inmediato
const CRITICAL_RESOURCES = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/loading.html',
  '/loading-screen.html',
  '/sitemap.xml'
];

// Recursos estáticos para cache
const STATIC_RESOURCES = [
  '/styles-courses.css',
  '/styles-optimized.css',
  '/styles.min.css',
  '/robots.txt',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=EB+Garamond:wght@400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', (event) => {
  console.log('Service Worker: Instalando caches...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_RESOURCES);
    }).then(() => {
      console.log('Service Worker: Recursos estáticos cacheados');
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activando...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log('Service Worker: Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Activado y limpio');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Solo para requests HTTP/HTTPS del mismo dominio
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return fetch(request);
  }
  
  // Estrategia: Cache First para estáticos, Network First para dinámicos
  const isStaticResource = STATIC_RESOURCES.some(resource => 
    url.pathname.includes(resource) || 
    request.destination === 'script' || 
    request.destination === 'style'
  );
  
  if (isStaticResource) {
    event.respondWith(cacheFirstStrategy(request));
  } else {
    event.respondWith(networkFirstStrategy(request));
  }
});

// Cache First Strategy - Para recursos estáticos
async function cacheFirstStrategy(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  
  if (cached) {
    console.log('Service Worker: Sirviendo desde cache:', request.url);
    return cached;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      console.log('Service Worker: Cacheando recurso estático:', request.url);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.error('Service Worker: Error en fetch:', error);
    return new Response('Error de red', { status: 408, statusText: 'Request Timeout' });
  }
}

// Network First Strategy - Para contenido dinámico
async function networkFirstStrategy(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      console.log('Service Worker: Cacheando recurso dinámico:', request.url);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('Service Worker: Red fallida, buscando en cache:', request.url);
    const cached = await cache.match(request);
    return cached || new Response('Sin conexión', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Background Sync para favoritos
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-favorites') {
    event.waitUntil(syncFavorites());
  }
});

async function syncFavorites() {
  try {
    const favorites = await getFavoritesFromStorage();
    // Sincronizar con servidor si es necesario
    console.log('Service Worker: Sincronizando favoritos:', favorites);
  } catch (error) {
    console.error('Service Worker: Error en sync:', error);
  }
}

// Helper para obtener favoritos del storage
async function getFavoritesFromStorage() {
  return new Promise((resolve) => {
    // Simular obtención de favoritos
    resolve([]);
  });
}

// Push notifications para nuevas recetas
self.addEventListener('push', (event) => {
  const options = {
    body: event.data.text(),
    icon: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' fill=\'%23000\' rx=\'6\'/%3E%3Cpath d=\'M6 8 L6 22 L13 22 Q16 22 16 19 Q16 16 14 15 Q16 14 16 11 Q16 8 13 8 Z M8 10 L12 10 Q14 10 14 12 Q14 14 12 14 L8 14 Z M8 16 L12 16 Q14 16 14 18 Q14 20 12 20 L8 20 Z\' fill=\'%23ffffff\'/%3E%3Cpath d=\'M18 8 L18 22 L20 22 L20 12 L22 18 L24 12 L24 22 L26 22 L26 8 L24 8 L22 14 L20 8 Z\' fill=\'%23d4af37\'/%3E%3C/svg%3E',
    badge: 'Nueva Receta',
    vibrate: [100, 50, 100],
    data: {
      url: '/recetas',
      action: 'view'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification('BARMASTER - Nueva Receta', options)
  );
});
