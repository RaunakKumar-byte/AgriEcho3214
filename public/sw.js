// AgriEcho PWA - Service Worker

const CACHE_NAME = 'agriecho-v1.0.0';
const STATIC_CACHE = 'agriecho-static-v1.0.0';
const DYNAMIC_CACHE = 'agriecho-dynamic-v1.0.0';

// Files to cache immediately
const STATIC_FILES = [
    '/',
    '/knowledge',
    '/weather',
    '/sos',
    '/voice',
    '/css/styles.css',
    '/js/app.js',
    '/js/offline.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// API endpoints that should be cached
const API_CACHE_PATTERNS = [
    /\/api\/sync/,
    /\/api\/weather/,
    /\/api\/articles/
];

// Install event - cache static files
self.addEventListener('install', event => {
    console.log('🔧 Service Worker installing...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('📦 Caching static files');
                return cache.addAll(STATIC_FILES);
            })
            .then(() => {
                console.log('✅ Static files cached successfully');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('❌ Failed to cache static files:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('🚀 Service Worker activating...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== STATIC_CACHE && 
                            cacheName !== DYNAMIC_CACHE && 
                            cacheName !== CACHE_NAME) {
                            console.log('🗑️ Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('✅ Service Worker activated');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve cached content when offline
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Handle different types of requests
    if (request.method === 'GET') {
        if (isStaticFile(request)) {
            event.respondWith(handleStaticFile(request));
        } else if (isAPIRequest(request)) {
            event.respondWith(handleAPIRequest(request));
        } else if (isPageRequest(request)) {
            event.respondWith(handlePageRequest(request));
        } else {
            event.respondWith(handleOtherRequest(request));
        }
    } else if (request.method === 'POST') {
        event.respondWith(handlePostRequest(request));
    }
});

// Check if request is for a static file
function isStaticFile(request) {
    const url = new URL(request.url);
    return url.pathname.startsWith('/css/') ||
           url.pathname.startsWith('/js/') ||
           url.pathname.startsWith('/icons/') ||
           url.pathname.endsWith('.png') ||
           url.pathname.endsWith('.jpg') ||
           url.pathname.endsWith('.jpeg') ||
           url.pathname.endsWith('.svg') ||
           url.pathname.endsWith('.ico');
}

// Check if request is for API
function isAPIRequest(request) {
    const url = new URL(request.url);
    return url.pathname.startsWith('/api/');
}

// Check if request is for a page
function isPageRequest(request) {
    const url = new URL(request.url);
    return request.headers.get('accept')?.includes('text/html');
}

// Handle static files - cache first strategy
async function handleStaticFile(request) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('Failed to handle static file:', error);
        return new Response('File not available offline', { status: 503 });
    }
}

// Handle API requests - network first, then cache
async function handleAPIRequest(request) {
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Cache successful API responses
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('Network failed, trying cache for API request');
        
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            // Add offline indicator header
            const response = cachedResponse.clone();
            response.headers.set('X-Served-From', 'cache');
            return response;
        }
        
        // Return offline response for specific API endpoints
        return handleOfflineAPIResponse(request);
    }
}

// Handle page requests - network first, then cache, then offline page
async function handlePageRequest(request) {
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('Network failed, trying cache for page request');
        
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Return offline page
        return caches.match('/') || new Response('Offline', { status: 503 });
    }
}

// Handle other requests
async function handleOtherRequest(request) {
    try {
        return await fetch(request);
    } catch (error) {
        return new Response('Request failed', { status: 503 });
    }
}

// Handle POST requests - try network, queue if offline
async function handlePostRequest(request) {
    try {
        const response = await fetch(request);
        return response;
    } catch (error) {
        console.log('POST request failed, queuing for later sync');
        
        // Queue the request for background sync
        const requestData = {
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries()),
            body: await request.text()
        };
        
        // Store in IndexedDB for background sync
        await storeFailedRequest(requestData);
        
        // Return a response indicating the request was queued
        return new Response(JSON.stringify({
            success: false,
            message: 'Request queued for sync when online',
            queued: true
        }), {
            status: 202,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Handle offline API responses
function handleOfflineAPIResponse(request) {
    const url = new URL(request.url);
    
    if (url.pathname === '/api/sync') {
        return new Response(JSON.stringify({
            success: true,
            data: {
                sos: [],
                queries: [],
                weather: []
            },
            offline: true
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    if (url.pathname === '/api/voice-query') {
        return new Response(JSON.stringify({
            success: true,
            response: "I'm currently offline. Your question has been saved and I'll respond when connectivity is restored.",
            offline: true
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    return new Response(JSON.stringify({
        success: false,
        error: 'Service unavailable offline',
        offline: true
    }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
    });
}

// Store failed requests for background sync
async function storeFailedRequest(requestData) {
    try {
        const db = await openDB();
        const transaction = db.transaction(['failedRequests'], 'readwrite');
        const store = transaction.objectStore('failedRequests');
        
        await store.add({
            ...requestData,
            timestamp: Date.now(),
            id: Date.now() + Math.random()
        });
        
        console.log('Failed request stored for background sync');
    } catch (error) {
        console.error('Failed to store request for background sync:', error);
    }
}

// Open IndexedDB
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('AgriEchoSW', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains('failedRequests')) {
                const store = db.createObjectStore('failedRequests', { keyPath: 'id' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

// Background Sync
self.addEventListener('sync', event => {
    console.log('🔄 Background sync triggered:', event.tag);
    
    if (event.tag === 'sync-sos-alerts') {
        event.waitUntil(syncSOSAlerts());
    } else if (event.tag === 'sync-voice-queries') {
        event.waitUntil(syncVoiceQueries());
    } else if (event.tag === 'sync-failed-requests') {
        event.waitUntil(syncFailedRequests());
    }
});

// Sync SOS alerts
async function syncSOSAlerts() {
    try {
        console.log('🚨 Syncing SOS alerts...');
        
        // Get pending SOS alerts from storage
        const pendingAlerts = await getStoredData('pendingSOSAlerts');
        
        for (const alert of pendingAlerts) {
            try {
                const response = await fetch('/api/sos', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(alert)
                });
                
                if (response.ok) {
                    console.log('✅ SOS alert synced successfully');
                    // Remove from pending list
                    await removeFromStoredData('pendingSOSAlerts', alert.id);
                }
            } catch (error) {
                console.error('Failed to sync SOS alert:', error);
            }
        }
    } catch (error) {
        console.error('Background sync failed for SOS alerts:', error);
    }
}

// Sync voice queries
async function syncVoiceQueries() {
    try {
        console.log('🎤 Syncing voice queries...');
        
        const pendingQueries = await getStoredData('offlineVoiceQueries');
        
        for (const query of pendingQueries) {
            try {
                const response = await fetch('/api/voice-query', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(query)
                });
                
                if (response.ok) {
                    console.log('✅ Voice query synced successfully');
                    await removeFromStoredData('offlineVoiceQueries', query);
                }
            } catch (error) {
                console.error('Failed to sync voice query:', error);
            }
        }
    } catch (error) {
        console.error('Background sync failed for voice queries:', error);
    }
}

// Sync failed requests
async function syncFailedRequests() {
    try {
        console.log('📤 Syncing failed requests...');
        
        const db = await openDB();
        const transaction = db.transaction(['failedRequests'], 'readonly');
        const store = transaction.objectStore('failedRequests');
        const requests = await store.getAll();
        
        for (const requestData of requests) {
            try {
                const response = await fetch(requestData.url, {
                    method: requestData.method,
                    headers: requestData.headers,
                    body: requestData.body
                });
                
                if (response.ok) {
                    // Remove successfully synced request
                    const deleteTransaction = db.transaction(['failedRequests'], 'readwrite');
                    const deleteStore = deleteTransaction.objectStore('failedRequests');
                    await deleteStore.delete(requestData.id);
                    
                    console.log('✅ Failed request synced successfully');
                }
            } catch (error) {
                console.error('Failed to sync request:', error);
            }
        }
    } catch (error) {
        console.error('Background sync failed for failed requests:', error);
    }
}

// Helper functions for localStorage operations
async function getStoredData(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Failed to get stored data:', error);
        return [];
    }
}

async function removeFromStoredData(key, itemId) {
    try {
        const data = await getStoredData(key);
        const filtered = data.filter(item => item.id !== itemId);
        localStorage.setItem(key, JSON.stringify(filtered));
    } catch (error) {
        console.error('Failed to remove from stored data:', error);
    }
}

// Push notifications (for future implementation)
self.addEventListener('push', event => {
    console.log('📬 Push notification received');
    
    const options = {
        body: event.data ? event.data.text() : 'New update available',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        vibrate: [200, 100, 200],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'explore',
                title: 'Open AgriEcho',
                icon: '/icons/icon-192.png'
            },
            {
                action: 'close',
                title: 'Close',
                icon: '/icons/icon-192.png'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('AgriEcho', options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
    console.log('🔔 Notification clicked');
    
    event.notification.close();
    
    if (event.action === 'explore') {
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// Message handling for communication with main thread
self.addEventListener('message', event => {
    console.log('💬 Message received in SW:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_NAME });
    }
});

console.log('🔧 Service Worker loaded successfully');