import React, { useState, useEffect, useLayoutEffect, useRef} from 'react';
import {EditorState, Transaction as PMTransaction, } from "prosemirror-state"
import { ReplaceStep, replaceStep, Step, StepResult } from "prosemirror-transform"
import {DirectEditorProps, EditorView} from "prosemirror-view"
import {schema} from "prosemirror-schema-basic"
import {DOMParser, Schema, Node, Slice} from "prosemirror-model"
import {addListNodes} from "prosemirror-schema-list"
// import {exampleSetup} from "prosemirror-example-setup"
import {keymap} from "prosemirror-keymap"
import {baseKeymap} from "prosemirror-commands"
import * as collab from "prosemirror-collab"
import firebase from 'firebase' 
import {db,auth} from './firebase'
import './Editor.css';

type SchemaType = typeof schema

interface StoredStep extends firebase.firestore.DocumentData {
  stepId:number,
  step:string,
  creator?:string,
  timestamp:Date
}

const {log} = console

const fileRef = db.collection('files').doc('testDoc')
const stepsRef = (fileRef.collection('steps') as firebase.firestore.CollectionReference<StoredStep>)

class DebouncedEditor extends EditorView{
  debounceTimer:number|null = null;
  sendSteps (sendableSteps:ReturnType<typeof collab['sendableSteps']>){  
    if ( sendableSteps) { 
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
            creator:auth.currentUser?.uid,
            timestamp: new Date()
          };
          transaction.set(newStepRef, stepItem);
        });

        // TBD: how do we handle storing value

        // const newValue = JSON.stringify(newState.toJSON().doc);
        // fileRef.update({ value: newValue });
      });
    }
  }
}

class FireStoreCollab {
  // firestore refs
  fileRef :firebase.firestore.DocumentReference<firebase.firestore.DocumentData> // add document type ( as it is in firestore)
  stepsRef : firebase.firestore.CollectionReference<StoredStep> // reference to the steps collection of the file on firestore 
  
  //last state from the server
  currentDocumentState:EditorState; // last state we took from the server
  doc:StepResult<SchemaType>['doc']; // document state  from currentDocumentState 
  version:number; // the document's current version from the currentDocumentState
  
  //current view
  view:DebouncedEditor ;
  //TODO userId : string[];
  //XXX onNewSteps : [];
  
  constructor(fireStoreCollab?:Omit<FireStoreCollab,'receiveSteps'|'stepsSince'>) {
    // do not call directly, instead use getDoc()
    
    // this.fileRef = db.collection('files').doc(fileId)
    // this.stepsRef = (this.fileRef.collection('steps') as firebase.firestore.CollectionReference<StoredStep>)
    // this.doc = null
    // this.version = null
    // this.stepClientIDs = []
    // this.onNewSteps = []
    if(!fireStoreCollab){
      throw new Error('Do not call this constructor directly, instead use FireStoreCollab.getDoc()')
    }
    this.fileRef  = fireStoreCollab.fileRef 
    this.stepsRef = fireStoreCollab.stepsRef
    this.doc = fireStoreCollab.doc
    this.version = fireStoreCollab.version
    
    this.currentDocumentState = fireStoreCollab.currentDocumentState
    this.view = this.createView();
    this.view.focus()
    // add listener
    stepsRef.onSnapshot(async (snapshot) => {
      const { currentDocumentState, view } = this
      // last state we pulled
      const latestDocumenntState = this.currentDocumentState
      const localDocumentVersion :number|undefined = collab.getVersion(latestDocumenntState)
      
      // latest state from server 
      const serverVersion = snapshot.docs.length
      const docChanges = snapshot.docChanges()
      
      if ( localDocumentVersion !== collab.getVersion(view.state)){
        // TODO rebasing
        log('snapshot needs rebase')
        log('localDocumentVersion', localDocumentVersion)
        log('viewVersion', collab.getVersion(view.state))
        log('serverVersion', serverVersion)
      }
      if(localDocumentVersion !== serverVersion){
        // if our version is outdated 
        const steps :Step<SchemaType>[] = []
        const clientIds :string[] = []
        docChanges
        .forEach((docChange) => {
          const data = docChange.doc.data();
          const step =Step.fromJSON(schema, JSON.parse(data.step))
          const id = String(data.creator)
          steps.push(step)
          clientIds.push(id)
        });

        try{
          const transaction = collab.receiveTransaction<SchemaType>(currentDocumentState, steps, clientIds);
          // doc1 + transaction = doc2
          const updatedDocumentFromServer = currentDocumentState!.apply(transaction);
          view.updateState(updatedDocumentFromServer);
        }catch(e){
          console.error(e)
        }
      }else{
        // our version is latest
      }
    })
  }
  
  static async getDoc( fileId:string,view:EditorView,userId:string) { 
    const fileRef = db.collection('files').doc(fileId)
    const stepsRef = (fileRef.collection('steps') as firebase.firestore.CollectionReference<StoredStep>)
    const stepClientIDs :number[] = []
    // const onNewSteps = []

    const myDoc = await fileRef.get()
    const mySteps = ( await stepsRef.get() ).docs
    
    const content = myDoc.data()?.value
    const state = EditorState.fromJSON(
      {
        schema:schema,
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
      currentDocumentState:state,
      view:view,
    })  
  }

  private createView():DebouncedEditor {
    const editorDiv = document.querySelector('#editor')!;
    const ediitorProps :DirectEditorProps = { 
      state: this.currentDocumentState,
      dispatchTransaction:this.onTransaction,
    };
    let view = new DebouncedEditor(editorDiv, ediitorProps);
    // const onTransaction = this.onTransaction();
    //   this.view.setProps({
    //     dispatchTransaction:this.onTransaction(view),

    //   })
    return view;
  }

  private onTransaction (this: DebouncedEditor, transaction: PMTransaction<SchemaType>) :void  {
    //'this' is the EditorView dispathing the action 
    const view = this
    const {state,debounceTimer} = view
    let stateWithChanges :EditorState = state.apply(transaction);
    let sendableSteps = collab.sendableSteps(stateWithChanges);
    
    if (sendableSteps) {
      // apply the changes with a new version number to view State
      const tr = collab.receiveTransaction(view.state, sendableSteps?.steps, [auth.currentUser?.uid || 'blregh']);
      stateWithChanges = state.apply(tr);

      
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      this.debounceTimer = setTimeout(() => {
        this.sendSteps(sendableSteps);
      }, 1000) as unknown as number;
    }
    view.updateState(stateWithChanges);
  }
  
  private destroyView() {
    this.view.destroy()
  }

  

  private async onStepsSnapshot (stepsSnapshot:firebase.firestore.QuerySnapshot<StoredStep>) {
    const latestDocumenntState = this.currentDocumentState
      // const localDocumentVersion :number|undefined = collab.sendableSteps(latestDocumenntState)?.version 
      const localDocumentVersion :number = this.version
      const viewDocumentVersion :number = collab.getVersion(this.view.state)
      const serverVersion = stepsSnapshot.docs.length
      const newChanges = stepsSnapshot.docChanges()
      
      log('serverVersion', serverVersion)
      log('localDocumentVersion', localDocumentVersion)
      // if our version is the current version 
      if(localDocumentVersion === serverVersion){
        return
      }
      else if ( localDocumentVersion !== viewDocumentVersion){
        log('rebase')
      }
      else {
        // if our  version outdated 
        const steps :Step<SchemaType>[] = []
        const clientIds :string[] = []
        newChanges
        .forEach((docChange) => {
          const data = docChange.doc.data();
          const step =Step.fromJSON(schema, JSON.parse(data.step))
          const id = String(data.creator)
          steps.push(step)
          clientIds.push(id)
        });

        try{
          const currentState = this.view.state
          const transaction = collab.receiveTransaction<SchemaType>(currentState, steps, clientIds);
          // doc1 + transaction = doc2
          const newState = currentState.apply(transaction);
          
          this.view.updateState(newState);
          this.currentDocumentState = newState
        }catch(e){
          console.error(e)
          return 
        }
      }
      // else{
      //   // // const currentStepId = stepIdRef.current || mySteps.length
      //   // const currentStepId:number  = collab.sendableSteps(view.state)?.version || mySteps.length
        
      //   // let onRemote = await stepsRef
      //   //   .where('stepId', '>', currentStepId )
      //   //   .orderBy('stepId', 'asc')
      //   //   .get();
        
      //   // const newDocs = onRemote.docs.map(doc => doc.data());
      
      //   // const clientIDs = newDocs.map(({ id }) => id);
      
      //   // const steps = newDocs.map(({ step }) => Step.fromJSON(schema, JSON.parse(step)));
      //   // try{

      //   //   const transaction = collab.receiveTransaction<SchemaType>(view.state, steps, clientIDs);
      //   //   // doc1 + transaction = doc2
      //   //   const newState = view.state.apply(transaction);
      //   //   log('tt',transaction);
      //   //   log(newState);
      //   //   view.updateState(newState);
          
      //   //   const newDocsCount = newDocs.length 
      //   //   stepIdRef.current! += newDocsCount
      //   // }catch(e){
      //   //   console.error(e)
      //   // }
      // }
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
          creator:auth.currentUser?.uid,
          timestamp: new Date()
        };
        transaction.set(newStepRef, stepItem);
      });
      const newValue = JSON.stringify(newState.toJSON().doc);
      fileRef.update({ value: newValue });
    });
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

        let sendableSteps = collab.sendableSteps(newState);
        if(sendableSteps){
          // TODO make it work like this on transcation
          log('before',collab.getVersion(currentDocumentState))
          const tr = collab.receiveTransaction(currentDocumentState,sendableSteps?.steps,[auth.currentUser?.uid||'blregh'])
          log('after',collab.getVersion(currentDocumentState.apply(tr)))
           
        }
        view.updateState(newState)
        
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
        setCurrentState((currentState)=>{
          const latestDocumenntState = currentState || currentDocumentState
          // const localDocumentVersion :number|undefined = collab.sendableSteps(latestDocumenntState)?.version 
          const localDocumentVersion :number|undefined = collab.getVersion(latestDocumenntState)
          const serverVersion = snapshot.docs.length
          const docChanges = snapshot.docChanges()
          
          if ( localDocumentVersion !== collab.getVersion(view.state)){
            log('rebase')
            
            log('localDocumentVersion', localDocumentVersion)
            log('viewVersion', collab.getVersion(view.state))
            log('serverVersion', serverVersion)
          }
    

          // if our version is the current version 
          if(localDocumentVersion === serverVersion){
            log('=')
            return currentState
          }
          else if( true ){
            // if our version outdated 
            const steps :Step<SchemaType>[] = []
            const clientIds :string[] = []
            docChanges
            .forEach((docChange) => {
              const data = docChange.doc.data();
              const step =Step.fromJSON(schema, JSON.parse(data.step))
              const id = String(data.creator)
              steps.push(step)
              clientIds.push(id)
            });

            try{
              const transaction = collab.receiveTransaction<SchemaType>(currentState!, steps, clientIds);
              // doc1 + transaction = doc2
              const newState = currentState!.apply(transaction);
              
              view.updateState(newState);
              return newState
            }catch(e){
              console.error(e)
              return currentState
            }
          }
          else{
            // // const currentStepId = stepIdRef.current || mySteps.length
            // const currentStepId:number  = collab.sendableSteps(view.state)?.version || mySteps.length
            
            // let onRemote = await stepsRef
            //   .where('stepId', '>', currentStepId )
            //   .orderBy('stepId', 'asc')
            //   .get();
            
            // const newDocs = onRemote.docs.map(doc => doc.data());
          
            // const clientIDs = newDocs.map(({ id }) => id);
          
            // const steps = newDocs.map(({ step }) => Step.fromJSON(schema, JSON.parse(step)));
            // try{

            //   const transaction = collab.receiveTransaction<SchemaType>(view.state, steps, clientIDs);
            //   // doc1 + transaction = doc2
            //   const newState = view.state.apply(transaction);
            //   log('tt',transaction);
            //   log(newState);
            //   view.updateState(newState);
              
            //   const newDocsCount = newDocs.length 
            //   stepIdRef.current! += newDocsCount
            // }catch(e){
            //   console.error(e)
            // }
          }
        })
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
