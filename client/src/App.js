import { useState, useEffect} from 'react'
import './App.css';
import axios from 'axios'
import { getToken, onMessageListener} from './firebase'

function App() {
  const [show, setShow] = useState(false);
  const [notification, setNotification] = useState({title: '', body: ''});
  const [isTokenFound, setTokenFound] = useState(false);
  const [text,setText] = useState('')
  useEffect(()=>{
    // console.log('aha');
    getToken(setTokenFound); 
  },[])
  

  onMessageListener().then(payload => {
    console.log('data',payload);
    setShow(true);
    setText( payload.data.text)
    
  }).catch(err => console.log('failed: ', err));

  return (
    <div className="App">
      <header className="App-header">
        {isTokenFound && <h1> Notification permission enabled 👍🏻 </h1>}
        {!isTokenFound && <h1> Need notification permission ❗️ </h1>}
        
        <textarea
          name='text'
          value={text}
          onChange={(e)=>{
            axios.post('/text',{text:e.target.value})
          }}
        >

        </textarea>

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
