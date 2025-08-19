// Service Worker para notificaciones push
console.log('Service Worker iniciado');

self.addEventListener('install', function(event) {
    console.log('SW: Instalando...');
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    console.log('SW: Activando...');
    event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', function(event) {
    console.log('SW: Notificación clickeada');
    event.notification.close();
    
    event.waitUntil(
        clients.matchAll().then(function(clientList) {
            if (clientList.length > 0) {
                return clientList[0].focus();
            }
            return clients.openWindow('/');
        })
    );
});

self.addEventListener('notificationclose', function(event) {
    console.log('SW: Notificación cerrada');
});

self.addEventListener('push', function(event) {
    console.log('SW: Push recibido');
    
    const options = {
        body: event.data ? event.data.text() : 'Notificación push',
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        tag: 'push-notification',
        requireInteraction: false
    };
    
    event.waitUntil(
        self.registration.showNotification('Push Notification', options)
    );
});

self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'TEST') {
        console.log('SW: Mensaje de prueba recibido');
        event.ports[0].postMessage('Service Worker funcionando');
    }
});