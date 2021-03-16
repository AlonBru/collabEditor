import React, { useState, useEffect, useLayoutEffect} from 'react';
import {EditorState} from "prosemirror-state"
import {EditorView} from "prosemirror-view"
import {DOMParser, Schema} from "prosemirror-model"
import {schema} from "prosemirror-schema-basic"
import {addListNodes} from "prosemirror-schema-list"
import {exampleSetup} from "prosemirror-example-setup"
import {keymap} from "prosemirror-keymap"
import {baseKeymap} from "prosemirror-commands"
import {collab} from "prosemirror-collab"

import './Editor.css';


function Editor1() {
  useEffect(() => {
      const mySchema = new Schema({
          nodes: addListNodes(schema.spec.nodes, "paragraph block*", "block"),
          marks: schema.spec.marks
      })

      window.view = new EditorView(document.querySelector("#editor"), {
          state: EditorState.create({
              doc: DOMParser.fromSchema(mySchema).parse(document.querySelector("#content")),
              plugins: exampleSetup({schema: mySchema})
          }),
          handlePaste(view,e,slice){
            console.log(view);
            return true
          }
      })
  },[]);

  return (
    <div className="App">
        <div id="editor" />
        <div id="content" />
    </div>
  );
}

function Editor ( ) { 
  const [state,setState] = useState(EditorState.create({
    schema,
    plugins:[
      keymap(baseKeymap),

    ]
  }))
  useLayoutEffect(
    ()=>{
      let view = new EditorView(
        document.querySelector('#editor'),
        {
          state,
          dispatchTransaction(transaction) {
            console.log(
              "Document size went from", 
              transaction.before.content.size,
              "to", 
              transaction.doc.content.size
            )
            
          console.log(transaction);
            let newState = view.state.apply(transaction)
            // setState(newState)
            view.updateState(newState)
            setState(newState)
          }
        }
      )
    },[])
    
  return <div style={{
    maxHeight:'400px',
    width:'600px',
    overflow:'auto'
  }} id='editor' />

}

function collabEditor(authority, place) {
  let view = new EditorView(place, {
    state: EditorState.create({
      doc: authority.doc,
      plugins: [collab.collab({version: authority.steps.length})]
    }),
    dispatchTransaction(transaction) {
      let newState = view.state.apply(transaction)
      view.updateState(newState)
      let sendable = collab.sendableSteps(newState)
      if (sendable)
        authority.receiveSteps(sendable.version, sendable.steps,
                               sendable.clientID)
    }
  })

  authority.onNewSteps.push(function() {
    let newData = authority.stepsSince(collab.getVersion(view.state))
    view.dispatch(
      collab.receiveTransaction(view.state, newData.steps, newData.clientIDs))
  })

  return view
}

export default Editor;

//sending a step
// db.runTransaction(transaction =>{
//   const doc = transaction.get(stepsRef.doc(currentStepId + 1))
//   if (doc.exists) {
//     throw new Error('rebase required!')
//   }
//   steps.forEach((step. i) => {
//     const newStepRef =
//     stepsRef.doc (currentStepId + i + 1);
//     transaction.set(newStepRef, step);
//   });
// })

// watching for remote steps
// stepsRef.onSnapshot(async () => {
//   let remote = await stepsRef
//     .where('stepId', 's', currentStepId)
//     .orderBy('stepId', 'asc')
//     .get();
//   remote = remote.docs.map(doc => doc.data());
//   const clientIDs = remote.map(({ id }) => id);
//   const steps = remote.map(({ step }) => step);
//   const transaction =
//   receiveTransaction(existingState, steps, clientIDs);
//   // doc1 + transaction = doc2
// });
  
