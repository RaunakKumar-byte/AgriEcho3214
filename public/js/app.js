// AgriEcho PWA - Main Application JavaScript

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('✅ Service Worker registered successfully:', registration.scope);
                
                // Check for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showNotification('New version available! Refresh to update.', 'info');
                        }
                    });
                });
            })
            .catch(error => {
                console.error('❌ Service Worker registration failed:', error);
            });
    });
}

// PWA Install Prompt
let deferredPrompt;
const installBanner = document.getElementById('installBanner');
const installBtn = document.getElementById('installBtn');
const dismissBtn = document.getElementById('dismissBtn');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Show install banner if not already installed
    if (!window.matchMedia('(display-mode: standalone)').matches) {
        setTimeout(() => {
            if (installBanner) {
                installBanner.style.display = 'block';
            }
        }, 3000); // Show after 3 seconds
    }
});

if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            
            if (outcome === 'accepted') {
                showNotification('AgriEcho installed successfully!', 'success');
            }
            
            deferredPrompt = null;
            installBanner.style.display = 'none';
        }
    });
}

if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
        installBanner.style.display = 'none';
        localStorage.setItem('installBannerDismissed', 'true');
    });
}

// Check if install banner was previously dismissed
if (localStorage.getItem('installBannerDismissed') === 'true') {
    if (installBanner) {
        installBanner.style.display = 'none';
    }
}

// Connection Status Management
let isOnline = navigator.onLine;
const connectionStatus = document.getElementById('connectionStatus');

function updateConnectionStatus() {
    const statusElement = connectionStatus;
    if (!statusElement) return;
    
    if (navigator.onLine) {
        statusElement.innerHTML = '<i class="fas fa-wifi"></i><span>Online</span>';
        statusElement.className = 'connection-status';
        isOnline = true;
    } else {
        statusElement.innerHTML = '<i class="fas fa-wifi-slash"></i><span>Offline</span>';
        statusElement.className = 'connection-status offline';
        isOnline = false;
    }
}

// Network event listeners
window.addEventListener('online', () => {
    updateConnectionStatus();
    showNotification('Back online! Syncing data...', 'success');
    syncOfflineData();
});

window.addEventListener('offline', () => {
    updateConnectionStatus();
    showNotification('You are now offline. Data will be saved locally.', 'warning');
});

// Initialize connection status
updateConnectionStatus();

// Offline Data Synchronization
async function syncOfflineData() {
    try {
        // Sync offline SOS alerts
        const pendingSOSAlerts = JSON.parse(localStorage.getItem('pendingSOSAlerts') || '[]');
        if (pendingSOSAlerts.length > 0) {
            await syncSOSAlerts(pendingSOSAlerts);
        }
        
        // Sync offline voice queries
        const offlineQueries = JSON.parse(localStorage.getItem('offlineVoiceQueries') || '[]');
        if (offlineQueries.length > 0) {
            await syncVoiceQueries(offlineQueries);
        }
        
        // Fetch latest data
        await fetchLatestData();
        
        showNotification('All data synchronized successfully!', 'success');
    } catch (error) {
        console.error('Sync error:', error);
        showNotification('Some data could not be synchronized', 'warning');
    }
}

async function syncSOSAlerts(alerts) {
    const successfulSyncs = [];
    
    for (const alert of alerts) {
        try {
            const response = await fetch('/api/sos', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(alert)
            });
            
            if (response.ok) {
                successfulSyncs.push(alert.id);
            }
        } catch (error) {
            console.error('Failed to sync SOS alert:', error);
        }
    }
    
    // Remove successfully synced alerts
    const remainingAlerts = alerts.filter(alert => !successfulSyncs.includes(alert.id));
    localStorage.setItem('pendingSOSAlerts', JSON.stringify(remainingAlerts));
    
    if (successfulSyncs.length > 0) {
        showNotification(`${successfulSyncs.length} SOS alert(s) synchronized`, 'success');
    }
}

async function syncVoiceQueries(queries) {
    const successfulSyncs = [];
    
    for (const query of queries) {
        try {
            const response = await fetch('/api/voice-query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(query)
            });
            
            if (response.ok) {
                successfulSyncs.push(query);
            }
        } catch (error) {
            console.error('Failed to sync voice query:', error);
        }
    }
    
    // Remove successfully synced queries
    const remainingQueries = queries.filter(query => 
        !successfulSyncs.some(synced => 
            synced.query === query.query && synced.timestamp === query.timestamp
        )
    );
    localStorage.setItem('offlineVoiceQueries', JSON.stringify(remainingQueries));
    
    if (successfulSyncs.length > 0) {
        showNotification(`${successfulSyncs.length} voice quer(ies) synchronized`, 'success');
    }
}

async function fetchLatestData() {
    try {
        const response = await fetch('/api/sync');
        if (response.ok) {
            const data = await response.json();
            
            // Update local cache with latest data
            localStorage.setItem('latestSyncData', JSON.stringify({
                ...data.data,
                timestamp: Date.now()
            }));
        }
    } catch (error) {
        console.error('Failed to fetch latest data:', error);
    }
}

// Notification System
function showNotification(message, type = 'info', duration = 4000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    const iconMap = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    notification.innerHTML = `
        <i class="fas ${iconMap[type]}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    // Animate out and remove
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, duration);
}

// Background Sync for Critical Data
if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    navigator.serviceWorker.ready.then(registration => {
        // Register background sync for SOS alerts
        const pendingSOSAlerts = JSON.parse(localStorage.getItem('pendingSOSAlerts') || '[]');
        if (pendingSOSAlerts.length > 0) {
            registration.sync.register('sync-sos-alerts').catch(err => {
                console.error('Background sync registration failed:', err);
            });
        }
        
        // Register background sync for voice queries
        const offlineQueries = JSON.parse(localStorage.getItem('offlineVoiceQueries') || '[]');
        if (offlineQueries.length > 0) {
            registration.sync.register('sync-voice-queries').catch(err => {
                console.error('Background sync registration failed:', err);
            });
        }
    });
}

// Geolocation Helper
function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported'));
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            position => resolve(position),
            error => reject(error),
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000 // 5 minutes
            }
        );
    });
}

// Local Storage Management
function saveToLocalStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (error) {
        console.error('Failed to save to localStorage:', error);
        return false;
    }
}

function getFromLocalStorage(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
        console.error('Failed to read from localStorage:', error);
        return defaultValue;
    }
}

// IndexedDB Helper for Large Data
class AgriEchoDB {
    constructor() {
        this.dbName = 'AgriEchoDB';
        this.version = 1;
        this.db = null;
    }
    
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object stores
                if (!db.objectStoreNames.contains('articles')) {
                    const articlesStore = db.createObjectStore('articles', { keyPath: 'id' });
                    articlesStore.createIndex('category', 'category', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('weatherData')) {
                    db.createObjectStore('weatherData', { keyPath: 'timestamp' });
                }
                
                if (!db.objectStoreNames.contains('sosAlerts')) {
                    db.createObjectStore('sosAlerts', { keyPath: 'id' });
                }
            };
        });
    }
    
    async saveArticle(article) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['articles'], 'readwrite');
            const store = transaction.objectStore('articles');
            const request = store.put(article);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async getArticles(category = null) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['articles'], 'readonly');
            const store = transaction.objectStore('articles');
            
            let request;
            if (category) {
                const index = store.index('category');
                request = index.getAll(category);
            } else {
                request = store.getAll();
            }
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async saveWeatherData(data) {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['weatherData'], 'readwrite');
            const store = transaction.objectStore('weatherData');
            const request = store.put({
                ...data,
                timestamp: Date.now()
            });
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async getLatestWeatherData() {
        if (!this.db) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['weatherData'], 'readonly');
            const store = transaction.objectStore('weatherData');
            const request = store.openCursor(null, 'prev'); // Get latest first
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    resolve(cursor.value);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }
}

// Initialize IndexedDB
const agriDB = new AgriEchoDB();

// Utility Functions
function formatDate(date) {
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(date));
}

function formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    
    if (diff < minute) {
        return 'Just now';
    } else if (diff < hour) {
        const minutes = Math.floor(diff / minute);
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else if (diff < day) {
        const hours = Math.floor(diff / hour);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
        const days = Math.floor(diff / day);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Performance Monitoring
function measurePerformance(name, fn) {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    console.log(`${name} took ${end - start} milliseconds`);
    return result;
}

// Error Handling
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    
    // Log error for debugging (in production, you might want to send this to a logging service)
    const errorInfo = {
        message: event.error?.message || 'Unknown error',
        stack: event.error?.stack,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
    };
    
    // Save error to localStorage for later analysis
    const errors = getFromLocalStorage('appErrors', []);
    errors.push(errorInfo);
    
    // Keep only last 10 errors
    if (errors.length > 10) {
        errors.splice(0, errors.length - 10);
    }
    
    saveToLocalStorage('appErrors', errors);
});

// Unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    const errorInfo = {
        type: 'unhandledrejection',
        reason: event.reason?.toString() || 'Unknown rejection',
        timestamp: new Date().toISOString(),
        url: window.location.href
    };
    
    const errors = getFromLocalStorage('appErrors', []);
    errors.push(errorInfo);
    
    if (errors.length > 10) {
        errors.splice(0, errors.length - 10);
    }
    
    saveToLocalStorage('appErrors', errors);
});

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🌾 AgriEcho PWA initialized');
    
    // Initialize IndexedDB
    agriDB.init().catch(error => {
        console.error('Failed to initialize IndexedDB:', error);
    });
    
    // Sync data if online
    if (navigator.onLine) {
        syncOfflineData();
    }
    
    // Set up periodic sync (every 5 minutes when online)
    setInterval(() => {
        if (navigator.onLine) {
            syncOfflineData();
        }
    }, 5 * 60 * 1000);
});

// Export utilities for use in other scripts
window.AgriEcho = {
    showNotification,
    getCurrentPosition,
    saveToLocalStorage,
    getFromLocalStorage,
    agriDB,
    formatDate,
    formatRelativeTime,
    debounce,
    throttle,
    measurePerformance
};