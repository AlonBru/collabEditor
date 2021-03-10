
const app = require('./app');
require('dotenv').config()
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert({
      projectId: process.env.PROJECT_ID,
      privateKey: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: process.env.CLIENT_EMAIL,
  }),
});

var registrationToken = 'registration from client';

var message = {
  notification: {
    title: 'hi',
    body: 'wassap',
  },
  token: registrationToken
};

// Send a message to the device corresponding to the provided
// registration token.
admin.messaging().send(message)
  .then((response) => {
    // Response is a message ID string.
    console.log('Successfully sent message:', response);
  })
  .catch((error) => {
    console.log('Error sending message:', error);
  });

const port = process.env.PORT || 3001;
app.listen(port, function () {
  console.log(`app is listening on port ${port}!`);
});