import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
// import { db, getToken, onMessageListener} from './firebase'
import './App.css';
import { db } from './firebase'
import * as jsondiffpatch from 'jsondiffpatch'

// const jdf = require('jsondiffpatch').create()
const jdf = jsondiffpatch.create({
  minLength: 10000 // default value
})
const log = console.log

function App() {
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
    setFile(doc)
    setText(myFile.data().name)

    doc.onSnapshot(snapshot=>{
      setText(text=>{
        const name = snapshot.data().name
        return name === text ? text : name 
      })
    }
  )
  },[])
  return (
    <div className="App">
      <header className="App-header">
        <h1>
          collabitor
        </h1>
        {file && 
          <textarea
            style={{
              height:'60vh',
              width:'70vw',
            }}
            ref={inputRef}
            onChange={e=>{
              const {value} = e.target
              if(debounceRef.current){
                clearTimeout(debounceRef.current)
              }
              debounceRef.current=setTimeout(
                async ()=>{
                  await db.collection('files').doc(file.id).update({name:value})
                  // setText(
                  //   text=>{
                  //   const diff = jdf.diff( text, data.name )
                  //   console.log(diff);
                  //   const patch = jdf.patch(text,diff)
                  //   console.log(patch);
                  //   return text
                  // })
                }, 400
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
