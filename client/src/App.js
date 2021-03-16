import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
// import { db, getToken, onMessageListener} from './firebase'
import './App.css';
import { db } from './firebase'
import Editor from './Editor'
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

        <Editor />      
      </header>
    </div>
  );
}

export default App;

  