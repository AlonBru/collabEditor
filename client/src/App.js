import { useState, useEffect} from 'react'
import './App.css';
import axios from 'axios'
import { getToken, onMessageListener} from './firebase'

function App() {
  const [show, setShow] = useState(false);
  const [notification, setNotification] = useState({title: '', body: ''});
  const [isTokenFound, setTokenFound] = useState(false);

  useEffect(()=>{
    // console.log('aha');
    getToken(setTokenFound);
  },[])
  

  onMessageListener().then(payload => {
    setShow(true);
    setNotification({title: payload.notification.title, body: payload.notification.body})
    console.log(payload);
  }).catch(err => console.log('failed: ', err));

  return (
    <div className="App">
      <header className="App-header">
        {isTokenFound && <h1> Notification permission enabled 👍🏻 </h1>}
        {!isTokenFound && <h1> Need notification permission ❗️ </h1>}
        <button onClick={()=>{
            axios.post('/message')
        }}>
          Send
        </button>
        <p>
          message:{notification.title}
        </p>
        <p>
          body:{notification.body}
        </p>
      
      </header>
    </div>
  );
}

export default App;
