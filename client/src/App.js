import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
// import { db, getToken, onMessageListener} from './firebase'
import './App.css';
import { db } from './firebase'
import * as jsondiffpatch from 'jsondiffpatch'
import Editor from './Editor'

// const jdf = require('jsondiffpatch').create()
const jdf = jsondiffpatch.create({
  minLength: 10000 // default value
})
const log = console.log

function App() {
  // const [show, setShow] = useState(false);
  // const [notification, setNotification] = useState({title: '', body: ''});
  // const [isTokenFound, setTokenFound] = useState(false);
  // const [text,setText] = useState('')
  // useEffect(()=>{
  //   // console.log('aha');
  //   getToken(setTokenFound); 
  // },[])
  const [file,setFile] = useState()
  const [text,setText] = useState('')
  const [cursor,setCursor] = useState()
  
  const debounceRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(async ()=>{
    const doc = await db.collection('files').doc('OyLpbZIyX6mmH64lgRcw')
    const changes = await db.collection('files').doc('OyLpbZIyX6mmH64lgRcw').collection('changes').get()

    const myFile = await doc.get()
    console.log('mf',myFile);  
    console.log('changes',changes.docs);  
    setFile(myFile)
    setText(myFile.data().name)

    doc.onSnapshot(snapshot=>{
      log(snapshot)
      setFile(snapshot)
      // const patch = jdf.patch(text,diff)

  })
    // db.collection('files').onSnapshot( async ( snapshot ) => {
    //   let changes= snapshot.docChanges()
    //   console.log('changes',changes);
    //   const change = changes[changes.length-1] 
    //   setFile(change.doc)
    // })
  },[])
  // onMessageListener().then(payload => {
  //   console.log('data',payload);
  //   setShow(true);
  //   setText( payload.data.text)
    
  // }).catch(err => console.log('failed: ', err));
  return (
    <div className="App">
      <header className="App-header">
        
        {file && 
          <textarea
            ref={inputRef}
            onMouseUp={()=>{
              console.log('ss',inputRef.current?.selectionStart)
            }}
            onChange={e=>{
              console.log('ss',inputRef.current?.selectionStart)
              const {value} = e.target
              if(debounceRef.current){
                clearTimeout(debounceRef.current)
              }
              debounceRef.current=setTimeout(
                async ()=>{
                  // const change = await db.collection('files').doc(file.id).update({name:value})
                  const change = await db.collection('files').doc(file.id).
                  // setText(
                  //   text=>{
                  //   const diff = jdf.diff( text, data.name )
                  //   console.log(diff);
                  //   const patch = jdf.patch(text,diff)
                  //   console.log(patch);
                  //   return text
                  // })
                },500
              )
              setText(value)
              // db.collection('files').doc(file.id).update({name:value})
            }}
            value={text}
          />
        }

        {/* {isTokenFound && <h1> Notification permission enabled 👍🏻 </h1>}
        {!isTokenFound && <h1> Need notification permission ❗️ </h1>} */}
        
        {/* <p>
          message:{notification.title}
        </p>
        <p>
          body:{notification.body}
        </p> */}
      
      </header>
    </div>
  );
}

export default App;
