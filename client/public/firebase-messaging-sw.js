importScripts('https://www.gstatic.com/firebasejs/8.2.0/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.2.0/firebase-messaging.js');
importScripts('./swenv.js')
// Initialize the Firebase app in the service worker by passing the generated config

firebase.initializeApp(firebaseConfig);

// Retrieve firebase messaging
const messaging = firebase.messaging();

messaging.onBackgroundMessage(
  function (payload) {
    console.log('Received background message ', payload);

    const notificationTitle = payload.notification.title;
    
    const notificationOptions = {
      body: payload.notification.body,
    };

    self.registration.showNotification(
      notificationTitle,
      notificationOptions
    );
  }
);