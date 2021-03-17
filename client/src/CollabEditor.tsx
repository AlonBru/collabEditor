import React, { useState, useEffect, useLayoutEffect, useRef} from 'react';
import {EditorState, Transaction as PMTransaction, } from "prosemirror-state"
import { ReplaceStep, replaceStep, Step, StepResult } from "prosemirror-transform"
import {EditorView} from "prosemirror-view"
import {schema} from "prosemirror-schema-basic"
import {DOMParser, Schema, Node, Slice} from "prosemirror-model"
import {addListNodes} from "prosemirror-schema-list"
// import {exampleSetup} from "prosemirror-example-setup"
import {keymap} from "prosemirror-keymap"
import {baseKeymap} from "prosemirror-commands"
import * as collab from "prosemirror-collab"
import firebase from 'firebase' 
import {db} from './firebase'
import './Editor.css';

type SchemaType = typeof schema

interface StoredStep extends firebase.firestore.DocumentData {
  stepId:number,
  step:string,
  userId?:string,
  timestamp:Date
}

const {log} = console

const fileRef = db.collection('files').doc('testDoc')
const stepsRef = (fileRef.collection('steps') as firebase.firestore.CollectionReference<StoredStep>)



class FireStoreCollab {
  doc:StepResult<SchemaType>['doc']; 
  fileRef :firebase.firestore.DocumentReference<firebase.firestore.DocumentData> // add document type ( as it is in firestore)
  stepsRef : firebase.firestore.CollectionReference<StoredStep> // add document type ( as it is in firestore)
  version:number;
  //TODO stepClientIDs : string[];
  //XXX onNewSteps : [];

  constructor(collab?:Omit<FireStoreCollab,'receiveSteps'|'stepsSince'>) {
    // do not call directly, instead use getDoc()

    // this.fileRef = db.collection('files').doc(fileId)
    // this.stepsRef = (this.fileRef.collection('steps') as firebase.firestore.CollectionReference<StoredStep>)
    // this.doc = null
    // this.version = null
    // this.stepClientIDs = []
    // this.onNewSteps = []
    if(!collab){
      throw new Error('Do not call this constructor directly, instead use FireStoreCollab.getDoc()')
    }
    this.fileRef  = collab.fileRef 
    this.stepsRef = collab.stepsRef
    this.doc = collab.doc
    this.version = collab.version
    // this.stepClientIDs = collab.stepClientIDs
    // this.onNewSteps = collab.onNewSteps
  }

  static async getDoc( fileId:string) { 
    const fileRef = db.collection('files').doc(fileId)
    const stepsRef = (fileRef.collection('steps') as firebase.firestore.CollectionReference<StoredStep>)
    const stepClientIDs :number[] = []
    // const onNewSteps = []

    const myDoc = await fileRef.get()
    const mySteps = ( await stepsRef.get() ).docs
    
    const content = myDoc.data()?.value
    const state = EditorState.fromJSON(
      {
        schema,
        plugins:[
          keymap(baseKeymap),
          collab.collab({version: mySteps.length})
        ]
      },
      JSON.parse(content),
    )
    return new FireStoreCollab({
      fileRef,
      stepsRef,
      doc : state.doc,
      version : mySteps.length,
    })  
  }

  //receives the client's current version, steps to add, and (TODO) client's Id
  receiveSteps(version :number, stepsToSend:Step<typeof schema>[], clientID:string) {
    // if (version != this.version) {
    //   return console.error( 'document version is wrong!')
    // }
    db.runTransaction<void>(async (transaction) =>{
      const nextVersion = String(version + 1)
      const doc = await transaction.get(this.stepsRef.doc(nextVersion))
      if (doc.exists) {
        throw new Error('rebase required!')
      }
      stepsToSend.forEach((step, i) => {
        const newId = String(version + i + 1);
        const newStepRef =
        this.stepsRef.doc (newId);
        // transaction.set(newStepRef, step);
      });
    })


    // Apply and accumulate new steps
    // steps.forEach(step => {
    //   this.doc = step.apply(this.doc!).doc
    //   this.steps.push(step)
    //   this.stepClientIDs.push(clientID)
    // })
    //// Signal listeners
    // this.onNewSteps.forEach(function(f) { f() })

    
  }

  async stepsSince( version:number ) {
    const steps  = await this.stepsRef
    .where('stepId', '>', version)
    .orderBy('stepId', 'asc')
    .get();
    return {
      steps
    }
  }
}

function Editor ( ) { 
  const [currentState,setCurrentState] = useState<EditorState|null>(null)

  const viewRef = useRef<EditorView|null>(null)
  const stepIdRef = useRef<number|null>(null)
  const debounceRef = useRef<number|null>(null)
  useEffect(()=>{
    (async ()=>{
      const myDoc = await fileRef.get()
      const mySteps = ( await stepsRef.get() ).docs
      const content = myDoc.data()?.value
      const currentDocumentState :EditorState<typeof schema> =  EditorState.create(
          {
            schema,
            plugins:[
              keymap(baseKeymap),
              collab.collab({version: mySteps.length})
            ],
            doc:Node.fromJSON(schema,JSON.parse(content)),
          },
      )
      setCurrentState(currentDocumentState)
      
      if(viewRef.current){
        viewRef.current.destroy()
      }

      const editorDiv = document.querySelector('#editor')!;
      const viewConfig = { state:currentDocumentState };
      let view = new EditorView( editorDiv, viewConfig )
      // add editor behaviour
      const onTransaction = (transaction: PMTransaction) => {
        
        const newState = view.state.apply(transaction)
        if(true || !transaction.steps.length ){
          const newState = view.state.apply(transaction) 
          view.updateState(newState)
        }
        const debounce = debounceRef.current
        if(debounce){
          clearTimeout(debounce)
        }

        debounceRef.current = setTimeout(()=>{
          sendSteps(newState, stepIdRef.current);
        },1000) as unknown as number
      };
      view.setProps({
        dispatchTransaction:onTransaction,

      })
      viewRef.current = view
      stepIdRef.current = mySteps.length

      view.focus()
      // add listener
      stepsRef.onSnapshot(async (snapshot) => {
        const latestDocumenntState = currentState || currentDocumentState
        
        const localDocumentVersion :number|undefined = collab.sendableSteps(latestDocumenntState)?.version 
        const serverVersion = snapshot.docs.length
        const docChanges = snapshot.docChanges()
        
        log('serverVersion', serverVersion)
        log('localDocumentVersion', localDocumentVersion)
        log('latestDocumenntState', latestDocumenntState)
        if(!localDocumentVersion){
          return
        }
        if( snapshot.docs.length !== localDocumentVersion || mySteps.length ){
          
          const steps :Step<SchemaType>[] = []
          const clientIds :string[] = []
          snapshot.docChanges()
          .forEach((docChange) => {
            const data = docChange.doc.data();
            const step =Step.fromJSON(schema, JSON.parse(data.step))
            const id = String(data.userId)
            steps.push(step)
            clientIds.push(id)
          });

          try{

            const transaction = collab.receiveTransaction<SchemaType>(view.state, steps, clientIds);
            // doc1 + transaction = doc2
            const newState = view.state.apply(transaction);
            view.updateState(newState);            
          }catch(e){
            console.error(e)
          }
        }
        else{
          // const currentStepId = stepIdRef.current || mySteps.length
          const currentStepId:number  = collab.sendableSteps(view.state)?.version || mySteps.length
          
          let onRemote = await stepsRef
            .where('stepId', '>', currentStepId )
            .orderBy('stepId', 'asc')
            .get();
          
          const newDocs = onRemote.docs.map(doc => doc.data());
        
          const clientIDs = newDocs.map(({ id }) => id);
        
          const steps = newDocs.map(({ step }) => Step.fromJSON(schema, JSON.parse(step)));
          try{

            const transaction = collab.receiveTransaction<SchemaType>(view.state, steps, clientIDs);
            // doc1 + transaction = doc2
            const newState = view.state.apply(transaction);
            log('tt',transaction);
            log(newState);
            view.updateState(newState);
            
            const newDocsCount = newDocs.length 
            stepIdRef.current! += newDocsCount
          }catch(e){
            console.error(e)
          }
        }
      })
    })()
  },[])
  // useLayoutEffect(
  //   ()=>{
  //     if(!viewRef.current){

  //       let view = new EditorView(
  //         document.querySelector('#editor')!,
  //         {
  //           state,
  //         }
  //         )
  //         log('json',JSON.stringify(state.toJSON()))
  //         const onTransaction = (transaction: PMTransaction) => {
  //           // let newState = view.state.apply(transaction);
  //           // view.updateState(newState);
  //           // setState(newState);
  //           db.runTransaction<void>(async (transaction)=>{
  //             const nextStep = String((currentStepId||0) + 1)
  //             const doc = await transaction.get(stepsRef.doc(nextStep))
  //             if (doc.exists) {
  //               throw new Error('rebase required!')
  //             }
  //             steps.forEach((step, i) => {
  //               const newId = String((currentStepId||0) + i + 1);
  //               const newStepRef =
  //               stepsRef.doc (newId);
  //               transaction.set(newStepRef, step);
  //             });
  //           })
  //         };
  //         view.setProps({
  //           dispatchTransaction:onTransaction
  //         })
  //         viewRef.current = view
  //       }
  //   },[])
    
  return <div>
    <button
      onClick={async ()=>{
        (await stepsRef.get()).docs.forEach(doc=>doc.ref.delete())
      }}
    >blah</button>
    <div style={{
    maxHeight:'400px',
    width:'600px',
    overflow:'auto'
    }} id='editor' />
    </div>

}



function sendSteps(newState: EditorState<SchemaType>, stepId:number | null) {
  let sendableSteps = collab.sendableSteps(newState);

  log('SS', sendableSteps?.steps.length); //add rebase function

  if ( sendableSteps) { 
    
     // authority.receiveSteps(stepsToSend.version, stepsToSend.steps,
    //   stepsToSend.clientID)
    // view.updateState(newState);
    // setState(newState);
    
    db.runTransaction<void>(async (transaction) => {
      const stepId = sendableSteps!.version
      //test if change with this stepId currently exists
      const nextStep = String((stepId || 0) + 1);
      const doc = await transaction.get(stepsRef.doc(nextStep));
      if (doc.exists) {
        console.error('rebase required!');
        // throw new Error('rebase required!')
      }
      sendableSteps?.steps.forEach((step, i) => {
        const newId = String((stepId || 0) + i + 1);
        const newStepRef = stepsRef.doc(newId);
        const stepItem: StoredStep = {
          stepId: Number(newId),
          step: JSON.stringify(step.toJSON()),
          timestamp: new Date()
        };
        transaction.set(newStepRef, stepItem);
      });
      const newValue = JSON.stringify(newState.toJSON().doc);
      fileRef.update({ value: newValue });
    });
  }
}

function collabEditor(authority:any, place:any) {
  const view =  new EditorView(place, {
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

// // watching for remote steps
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
  

// function Editor1() {
//   useEffect(() => {
//       const mySchema = new Schema({
//           nodes: addListNodes(schema.spec.nodes, "paragraph block*", "block"),
//           marks: schema.spec.marks
//       })

//       window.view = new EditorView(document.querySelector("#editor"), {
//           state: EditorState.create({
//               doc: DOMParser.fromSchema(mySchema).parse(document.querySelector("#content")),
//               plugins: exampleSetup({schema: mySchema})
//           }),
//           handlePaste(view,e,slice){
//             console.log(view);
//             return true
//           }
//       })
//   },[]);

//   return (
//     <div className="App">
//         <div id="editor" />
//         <div id="content" />
//     </div>
//   );
// }
