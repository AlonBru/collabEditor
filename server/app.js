// require('dotenv').config()
const express = require('express') 

const app = express()
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert({
      projectId: process.env.PROJECT_ID,
      privateKey: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: process.env.CLIENT_EMAIL,
  }),
});
console.log('firebase admin up')

const users = []

app.use(express.json())

let num = 0
app.get('/ping',( req , res ) => {
  res.send('pong')
})

app.post('/register',( req , res ) => {
    const {token:registrationToken} = req.body
    console.log('register');
    users.push(registrationToken)
  // const message = {
  //   notification: {
  //     title: 'hi',
  //     body: 'wassap ' + ++num,
  //   },
  //   token: registrationToken
  // };

  // // Send a message to the device corresponding to the provided
  // // registration token.
  // messaging.send(message)
  //   .then((response) => {
  //     // Response is a message ID string.
  //     console.log('Successfully sent message:', response);
  //   })
  //   .catch((error) => {
  //     console.log('Error sending message:', error);
  //   });


  res.status(200).send()
})
app.post('/message',( req , res ) => {
  console.log(users[0]);
  const message = {
    notification: {
      title: 'hi',
      body: 'wassap ' + ++num,
    },
    token: users[0]
  };

  // Send a message to the device corresponding to the provided
  // registration token.
  // if(num>2) return
  admin.messaging().send(message,false)
    .then((response) => {
      // Response is a message ID string.
      console.log('Successfully sent message:', response);
    })
    .catch((error) => {
      console.log('Error sending message:', error);
    });


  res.status(200).send()
})
module.exports = app