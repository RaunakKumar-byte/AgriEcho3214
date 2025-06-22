// AgriEcho PWA - Offline Functionality

// Offline Data Management
class OfflineManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.syncQueue = [];
        this.maxRetries = 3;
        this.retryDelay = 5000; // 5 seconds
        
        this.init();
    }
    
    init() {
        // Listen for online/offline events
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // Initialize offline data stores
        this.initializeOfflineStores();
        
        // Set up periodic sync attempts
        this.setupPeriodicSync();
    }
    
    initializeOfflineStores() {
        // Initialize localStorage keys if they don't exist
        const stores = [
            'offlineArticles',
            'pendingSOSAlerts',
            'offlineVoiceQueries',
            'cachedWeatherData',
            'offlineUserPreferences',
            'syncQueue'
        ];
        
        stores.forEach(store => {
            if (!localStorage.getItem(store)) {
                localStorage.setItem(store, JSON.stringify([]));
            }
        });
        
        // Load existing sync queue
        this.syncQueue = JSON.parse(localStorage.getItem('syncQueue') || '[]');
    }
    
    handleOnline() {
        this.isOnline = true;
        console.log('📶 Connection restored - starting sync');
        
        // Update UI
        this.updateConnectionUI(true);
        
        // Start syncing queued data
        this.processSyncQueue();
        
        // Show notification
        if (window.AgriEcho) {
            window.AgriEcho.showNotification('Back online! Syncing your data...', 'success');
        }
    }
    
    handleOffline() {
        this.isOnline = false;
        console.log('📵 Connection lost - switching to offline mode');
        
        // Update UI
        this.updateConnectionUI(false);
        
        // Show notification
        if (window.AgriEcho) {
            window.AgriEcho.showNotification('You\'re offline. Data will be saved locally.', 'warning');
        }
    }
    
    updateConnectionUI(isOnline) {
        const connectionStatus = document.getElementById('connectionStatus');
        if (connectionStatus) {
            if (isOnline) {
                connectionStatus.innerHTML = '<i class="fas fa-wifi"></i><span>Online</span>';
                connectionStatus.className = 'connection-status';
            } else {
                connectionStatus.innerHTML = '<i class="fas fa-wifi-slash"></i><span>Offline</span>';
                connectionStatus.className = 'connection-status offline';
            }
        }
        
        // Update other offline indicators
        const offlineIndicators = document.querySelectorAll('.offline-indicator');
        offlineIndicators.forEach(indicator => {
            indicator.style.display = isOnline ? 'none' : 'block';
        });
    }
    
    // Add data to sync queue
    addToSyncQueue(type, data, endpoint, method = 'POST') {
        const syncItem = {
            id: Date.now() + Math.random(),
            type,
            data,
            endpoint,
            method,
            timestamp: Date.now(),
            retries: 0,
            status: 'pending'
        };
        
        this.syncQueue.push(syncItem);
        this.saveSyncQueue();
        
        console.log(`📝 Added ${type} to sync queue:`, syncItem);
        
        // Try to sync immediately if online
        if (this.isOnline) {
            this.processSyncQueue();
        }
        
        return syncItem.id;
    }
    
    // Process sync queue
    async processSyncQueue() {
        if (!this.isOnline || this.syncQueue.length === 0) {
            return;
        }
        
        console.log(`🔄 Processing sync queue (${this.syncQueue.length} items)`);
        
        const pendingItems = this.syncQueue.filter(item => item.status === 'pending');
        
        for (const item of pendingItems) {
            try {
                await this.syncItem(item);
            } catch (error) {
                console.error(`Failed to sync item ${item.id}:`, error);
                
                item.retries++;
                if (item.retries >= this.maxRetries) {
                    item.status = 'failed';
                    console.error(`Item ${item.id} failed after ${this.maxRetries} retries`);
                } else {
                    // Retry later
                    setTimeout(() => {
                        if (this.isOnline) {
                            this.syncItem(item);
                        }
                    }, this.retryDelay * item.retries);
                }
            }
        }
        
        this.saveSyncQueue();
        this.updateSyncStatus();
    }
    
    // Sync individual item
    async syncItem(item) {
        console.log(`🔄 Syncing ${item.type}:`, item.data);
        
        const response = await fetch(item.endpoint, {
            method: item.method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(item.data)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            item.status = 'completed';
            item.completedAt = Date.now();
            console.log(`✅ Successfully synced ${item.type}`);
            
            // Remove from local storage if it was stored there
            this.removeFromLocalStorage(item);
            
        } else {
            throw new Error(result.error || 'Sync failed');
        }
    }
    
    // Remove synced data from local storage
    removeFromLocalStorage(item) {
        switch (item.type) {
            case 'sos-alert':
                const sosAlerts = JSON.parse(localStorage.getItem('pendingSOSAlerts') || '[]');
                const filteredSOS = sosAlerts.filter(alert => alert.id !== item.data.id);
                localStorage.setItem('pendingSOSAlerts', JSON.stringify(filteredSOS));
                break;
                
            case 'voice-query':
                const voiceQueries = JSON.parse(localStorage.getItem('offlineVoiceQueries') || '[]');
                const filteredQueries = voiceQueries.filter(query => 
                    !(query.query === item.data.query && query.timestamp === item.data.timestamp)
                );
                localStorage.setItem('offlineVoiceQueries', JSON.stringify(filteredQueries));
                break;
        }
    }
    
    // Save sync queue to localStorage
    saveSyncQueue() {
        // Keep only pending and recent completed items
        const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
        this.syncQueue = this.syncQueue.filter(item => 
            item.status === 'pending' || 
            item.status === 'failed' || 
            (item.completedAt && item.completedAt > cutoffTime)
        );
        
        localStorage.setItem('syncQueue', JSON.stringify(this.syncQueue));
    }
    
    // Update sync status in UI
    updateSyncStatus() {
        const pendingCount = this.syncQueue.filter(item => item.status === 'pending').length;
        const failedCount = this.syncQueue.filter(item => item.status === 'failed').length;
        
        // Update pending count displays
        const pendingElements = document.querySelectorAll('.pending-sync-count');
        pendingElements.forEach(el => {
            el.textContent = pendingCount;
        });
        
        // Update sync status messages
        const statusElements = document.querySelectorAll('.sync-status-message');
        statusElements.forEach(el => {
            if (pendingCount > 0) {
                el.textContent = `${pendingCount} item${pendingCount > 1 ? 's' : ''} waiting to sync`;
                el.className = 'sync-status-message pending';
            } else if (failedCount > 0) {
                el.textContent = `${failedCount} item${failedCount > 1 ? 's' : ''} failed to sync`;
                el.className = 'sync-status-message failed';
            } else {
                el.textContent = 'All data synchronized';
                el.className = 'sync-status-message success';
            }
        });
    }
    
    // Set up periodic sync attempts
    setupPeriodicSync() {
        // Try to sync every 30 seconds when online
        setInterval(() => {
            if (this.isOnline && this.syncQueue.length > 0) {
                this.processSyncQueue();
            }
        }, 30000);
        
        // Clean up old completed items every hour
        setInterval(() => {
            this.saveSyncQueue();
        }, 60 * 60 * 1000);
    }
    
    // Manual sync trigger
    async forcSync() {
        if (!this.isOnline) {
            if (window.AgriEcho) {
                window.AgriEcho.showNotification('Cannot sync while offline', 'warning');
            }
            return;
        }
        
        if (window.AgriEcho) {
            window.AgriEcho.showNotification('Starting manual sync...', 'info');
        }
        
        await this.processSyncQueue();
        
        if (window.AgriEcho) {
            const pendingCount = this.syncQueue.filter(item => item.status === 'pending').length;
            if (pendingCount === 0) {
                window.AgriEcho.showNotification('All data synchronized!', 'success');
            } else {
                window.AgriEcho.showNotification(`${pendingCount} items still pending`, 'warning');
            }
        }
    }
    
    // Get sync statistics
    getSyncStats() {
        const stats = {
            total: this.syncQueue.length,
            pending: this.syncQueue.filter(item => item.status === 'pending').length,
            completed: this.syncQueue.filter(item => item.status === 'completed').length,
            failed: this.syncQueue.filter(item => item.status === 'failed').length,
            isOnline: this.isOnline
        };
        
        return stats;
    }
}

// Offline Article Management
class OfflineArticleManager {
    constructor() {
        this.storageKey = 'offlineArticles';
    }
    
    saveArticle(article) {
        const articles = this.getArticles();
        const existingIndex = articles.findIndex(a => a.id === article.id);
        
        if (existingIndex >= 0) {
            articles[existingIndex] = { ...article, savedAt: Date.now() };
        } else {
            articles.push({ ...article, savedAt: Date.now() });
        }
        
        localStorage.setItem(this.storageKey, JSON.stringify(articles));
        
        if (window.AgriEcho) {
            window.AgriEcho.showNotification('Article saved for offline reading!', 'success');
        }
        
        return true;
    }
    
    getArticles() {
        return JSON.parse(localStorage.getItem(this.storageKey) || '[]');
    }
    
    getArticle(id) {
        const articles = this.getArticles();
        return articles.find(a => a.id === id);
    }
    
    removeArticle(id) {
        const articles = this.getArticles();
        const filtered = articles.filter(a => a.id !== id);
        localStorage.setItem(this.storageKey, JSON.stringify(filtered));
        
        if (window.AgriEcho) {
            window.AgriEcho.showNotification('Article removed from offline storage', 'info');
        }
        
        return true;
    }
    
    isArticleSaved(id) {
        const articles = this.getArticles();
        return articles.some(a => a.id === id);
    }
    
    getStorageSize() {
        const articles = this.getArticles();
        const sizeInBytes = new Blob([JSON.stringify(articles)]).size;
        return {
            articles: articles.length,
            sizeInBytes,
            sizeInKB: Math.round(sizeInBytes / 1024),
            sizeInMB: Math.round(sizeInBytes / (1024 * 1024))
        };
    }
    
    clearAll() {
        localStorage.removeItem(this.storageKey);
        
        if (window.AgriEcho) {
            window.AgriEcho.showNotification('All offline articles cleared', 'info');
        }
    }
}

// Offline Weather Cache
class OfflineWeatherManager {
    constructor() {
        this.storageKey = 'cachedWeatherData';
        this.maxAge = 6 * 60 * 60 * 1000; // 6 hours
    }
    
    cacheWeatherData(data) {
        const weatherData = {
            ...data,
            cachedAt: Date.now()
        };
        
        localStorage.setItem(this.storageKey, JSON.stringify(weatherData));
        console.log('Weather data cached for offline use');
    }
    
    getCachedWeatherData() {
        const cached = localStorage.getItem(this.storageKey);
        if (!cached) return null;
        
        const data = JSON.parse(cached);
        const age = Date.now() - data.cachedAt;
        
        if (age > this.maxAge) {
            // Data is too old, remove it
            localStorage.removeItem(this.storageKey);
            return null;
        }
        
        return data;
    }
    
    isCacheValid() {
        const cached = this.getCachedWeatherData();
        return cached !== null;
    }
    
    getCacheAge() {
        const cached = localStorage.getItem(this.storageKey);
        if (!cached) return null;
        
        const data = JSON.parse(cached);
        return Date.now() - data.cachedAt;
    }
}

// Initialize offline managers
const offlineManager = new OfflineManager();
const articleManager = new OfflineArticleManager();
const weatherManager = new OfflineWeatherManager();

// Export for global use
window.OfflineManager = {
    sync: offlineManager,
    articles: articleManager,
    weather: weatherManager,
    
    // Convenience methods
    saveForOffline: (type, data, endpoint, method) => {
        return offlineManager.addToSyncQueue(type, data, endpoint, method);
    },
    
    forcSync: () => {
        return offlineManager.forcSync();
    },
    
    getSyncStats: () => {
        return offlineManager.getSyncStats();
    },
    
    saveArticle: (article) => {
        return articleManager.saveArticle(article);
    },
    
    isArticleSaved: (id) => {
        return articleManager.isArticleSaved(id);
    },
    
    cacheWeather: (data) => {
        return weatherManager.cacheWeatherData(data);
    },
    
    getCachedWeather: () => {
        return weatherManager.getCachedWeatherData();
    }
};

// Add manual sync button functionality
document.addEventListener('DOMContentLoaded', () => {
    // Add sync buttons to pages that need them
    const syncButtons = document.querySelectorAll('.manual-sync-btn');
    syncButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            offlineManager.forcSync();
        });
    });
    
    // Update sync status on page load
    offlineManager.updateSyncStatus();
    
    // Set up periodic UI updates
    setInterval(() => {
        offlineManager.updateSyncStatus();
    }, 10000); // Update every 10 seconds
});

console.log('📱 Offline functionality initialized');