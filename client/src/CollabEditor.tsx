import React, { useState, useEffect, useLayoutEffect, useRef} from 'react';
import {EditorState, Transaction as PMTransaction, Selection } from "prosemirror-state"
import { Mapping, ReplaceStep, replaceStep, Step, StepMap, StepResult } from "prosemirror-transform"
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

// const fileRef = db.collection('files').doc('testDoc')
// const stepsRef = (fileRef.collection('steps') as firebase.firestore.CollectionReference<StoredStep>)

//@ts-ignore
interface DebounceEditorProps extends DirectEditorProps {
  dispatchTransaction(this: DebouncedEditorView, transaction: PMTransaction): void;
};

class DebouncedEditorView extends EditorView{
  debounceTimer:number|null = null;
  fileRef :firebase.firestore.DocumentReference<firebase.firestore.DocumentData> // add document type ( as it is in firestore)
  stepsRef:FireStoreCollab['stepsRef'];
  userId:string;
  constructor(editorViewProps: ConstructorParameters<typeof EditorView> , fileRef:DebouncedEditorView['fileRef'], stepsRef: FireStoreCollab['stepsRef'],userId:string){
    super(...editorViewProps)
    this.fileRef = fileRef 
    this.stepsRef = stepsRef 
    this.userId = userId 
  }

  sendSteps ( {version:versionBeforeChanges, steps,clientID }: NonNullable< ReturnType< typeof collab['sendableSteps'] >> ){  
    db.runTransaction<void>(async (transaction) => {
      log('sending')
      //test if step with this stepId currently exists (someone else's changes were pushed already)
      let nextStepId:number =  versionBeforeChanges + 1;
      const nextStepRef = this.stepsRef.doc( String( nextStepId ));
      const nextStepDoc = await transaction.get(nextStepRef);
      if (nextStepDoc.exists) {
        console.error('rebase required!');
        // throw new Error('rebase required!')
        log(nextStepDoc.data())
        const newChanges = await this.stepsRef
        .where('stepId', '>', versionBeforeChanges)
        .orderBy('stepId', 'asc')
        .get()

        const newStepsMaps :StepMap[] = []
        const stepsBy :string[] = []
        newChanges.forEach((docChange) => {
          const data = docChange.data();
          const step =Step.fromJSON(schema, JSON.parse(data.step))
          const id = String(data.creator)
          newStepsMaps.push(step.getMap())
          stepsBy.push(id)
        });
        const mappedSteps = steps.reduce<Step[]>(
          (acc,step,i,arr)=>{
            const invertedMap = (acc[acc.length-1] as Step|undefined)?.getMap().invert()
            const stepsToMap = invertedMap? [invertedMap, ...newStepsMaps]: newStepsMaps;
            const mapping = new Mapping(
              stepsToMap
            )
            const maybeMappedStep = step.map(mapping)
            const stepsArray = [...acc]
            maybeMappedStep && stepsArray.push(maybeMappedStep)
            return stepsArray
          },
          []
        )
        if(mappedSteps){
          nextStepId += newStepsMaps.length 
          steps = mappedSteps
        }else{
          return
        }
      } 
      steps.forEach((step, i) => {
        const newId :number = nextStepId + i;
        log(newId)
        const newStepRef = this.stepsRef.doc(String( newId ));
        const stepItem: StoredStep = {
          stepId: Number(newId),
          step: JSON.stringify(step.toJSON()),
          creator:this.userId,
          timestamp: new Date()
        };
        transaction.set(newStepRef, stepItem);
      });
      // TBD: how do we handle storing value
      const newState = this.state
      const newValue = JSON.stringify(newState.toJSON().doc);
      transaction.update( this.fileRef, { value: newValue })
      // this.fileRef.update();
    });
  }
}

type FireStoreCollabStarter = Omit<FireStoreCollab, 'view' | 'receiveSteps' | 'stepsSince' | 'onSnapshot' | 'destroyView'| 'getVersion'>;

class FireStoreCollab {
  // firestore refs
  fileRef :firebase.firestore.DocumentReference<firebase.firestore.DocumentData> // add document type ( as it is in firestore)
  stepsRef : firebase.firestore.CollectionReference<StoredStep> // reference to the steps collection of the file on firestore 
  //last state from the server
  currentDocumentState:EditorState; // last state we took from the server
  doc:StepResult<SchemaType>['doc']; // document state  from currentDocumentState 
  
  //current view
  view:DebouncedEditorView ;
  //TODO userId : string[];
  //XXX onNewSteps : [];
  
  constructor( fireStoreCollab?:FireStoreCollabStarter&{userId:string}) {
    // do not call directly, instead use getDoc()
    if(!fireStoreCollab){
      throw new Error('Do not call this constructor directly, instead use FireStoreCollab.getDoc()')
    }
    this.fileRef = fireStoreCollab.fileRef
    this.stepsRef = fireStoreCollab.stepsRef
    this.doc = fireStoreCollab.doc
    
    this.currentDocumentState = fireStoreCollab.currentDocumentState
    this.view = this.createView(fireStoreCollab.userId);
    // this.view.focus()

    this.onStepsSnapshot.bind(this)
  }
  
  static async getDoc(fileCollectionName:string='files', fileId:string, userId:string ) { 
    const fileRef = db.collection(fileCollectionName).doc(fileId)
    const stepsRef = (fileRef.collection('steps') as firebase.firestore.CollectionReference<StoredStep>)
    const stepClientIDs :number[] = []
    // const onNewSteps = []

    const myDoc = await fileRef.get()
    const mySteps = (await stepsRef.orderBy('stepId','asc').get())
    
    const content = myDoc.data()?.value
    // checking the version by last step instead of step count because sometimes it seems a step number is skipped, reason TBD
    const version = mySteps.docs[mySteps.size-1]?.data().stepId||0; 
    console.assert(mySteps.size === version, `count:${mySteps.size} version:${version}`)
    try{
      
      const state = EditorState.create(
        {
          schema:schema,
          plugins:[
            keymap(baseKeymap),
            collab.collab({version,clientID:userId})
          ],
          doc:Node.fromJSON(schema,JSON.parse(content))
        },
      )
      log((state as any) )
      return new FireStoreCollab({
        fileRef,
        stepsRef,
        doc : state.doc,
        currentDocumentState:state,
        userId
      })  
    }catch(err){
        console.error(err)
    }
  }
      
  private createView(userId:string):DebouncedEditorView {
    const editorDiv = document.querySelector('#editor')!;
    const editorProps : DirectEditorProps = { 
      state: this.currentDocumentState,
    };
    
    let view = new DebouncedEditorView( [editorDiv, editorProps] , this.fileRef, this.stepsRef, userId );

    const onTransaction = this.onTransaction.bind(view,this.currentDocumentState)
    view.setProps({
      dispatchTransaction:function (tr){onTransaction(tr)}
    })
    return view;
  }
  
  private onTransaction (this: DebouncedEditorView, lastPulledState:EditorState<SchemaType>, transaction: PMTransaction<SchemaType>) :void  {
    //clear the debounce timer to prevent older state being sent
    clearTimeout( this.debounceTimer || undefined)
    //'this' is the EditorView dispathing the action 
    const view = this
    const {state: currentViewState,debounceTimer} = view
    
    // whether the transaction contains changes the view's content ( as opposed to selection only )
    const hasChanges = transaction.docChanged

    let viewStateWithLatestChanges :EditorState = currentViewState.apply(transaction);    
    const stepsToSend = collab.sendableSteps(viewStateWithLatestChanges)

    if(stepsToSend){
      log(stepsToSend)
      // if the transaction does change the view's content  
      if ( Boolean(hasChanges) ) {

        const sendSteps = this.sendSteps.bind( this, stepsToSend );
        this.debounceTimer = setTimeout( sendSteps , 800) as unknown as number;
      } 
      // if the transaction does not change the view's content, but stored steps are available to send  
      else {
        this.sendSteps( stepsToSend );
      }
    }
    view.updateState(viewStateWithLatestChanges);
      
  }
  // used onComponentDismount to cleanup
  destroyView() {
    this.view.destroy()
  }
  // called when once on setup, then again every time steps collection is updated
  private async onStepsSnapshot (this:FireStoreCollab, stepsSnapshot:firebase.firestore.QuerySnapshot<StoredStep> ) {
    log(stepsSnapshot.docChanges().map(step=>step.doc.data()))
    const latestPulledDocumentState = this.currentDocumentState
    const localDocumentVersion :number = collab.getVersion(latestPulledDocumentState)
    const serverVersion = stepsSnapshot.docs.length
    const newChanges = stepsSnapshot.docChanges()
    // if our version is the current version 
    if(localDocumentVersion === serverVersion) {
      return
    }
    // if our version outdated
    else {
      const newSteps :Step<SchemaType>[] = []
      const stepsBy :string[] = []

      newChanges
      .forEach((docChange) => {
        const data = docChange.doc.data();
        const step =Step.fromJSON(schema, JSON.parse(data.step))
        const id = String(data.creator)
        newSteps.push(step)
        stepsBy.push(id)
      });
      try{  
        const transaction = collab
          .receiveTransaction<SchemaType>(this.view.state, newSteps, stepsBy)
        const stateWithRemoteChanges = this.view.state.apply(transaction);
        this.view.updateState(stateWithRemoteChanges);
        this.currentDocumentState = stateWithRemoteChanges
      }catch(e){
        console.error(e)
      }
    }
  }

  onSnapshot(){
    return this.onStepsSnapshot.bind(this)
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
        throw new Error('rebase required')
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
  getVersion(){
    const version = collab.getVersion(this.view.state)
    return version
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
  const [ firestoreCollab,setFirestoreCollab ] = useState<FireStoreCollab>()
  const [ name,setName] = useState<string>('')

  useEffect(()=>{
    const userId = name
    FireStoreCollab.getDoc( 'files', 'testDoc', userId )
    .then( (FireStoreCollabObject )=> setFirestoreCollab(FireStoreCollabObject))
  },[name])
  useEffect(()=>{
    if(firestoreCollab){
      const version = firestoreCollab.getVersion()
      log(version)
      const unsubscribeFromSteps = firestoreCollab.stepsRef
        .orderBy('stepId','asc')
        .startAfter(version)
        .onSnapshot(
          { 
            next:firestoreCollab.onSnapshot(),
            error:(e)=>{console.error()}
          }
        ) //TODO: Add onError
      return ()=>{ 
        unsubscribeFromSteps();
        firestoreCollab.destroyView() 
      }
    }
  },[firestoreCollab])
    
  return <div>
    <button
      onClick={async ()=>{
        (await firestoreCollab?.stepsRef.get())?.docs.forEach(doc=>doc.ref.delete())
      }}
    >blah</button>
    <input value={name} onChange={( e ) => {setName(e.target.value)}} />
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
        authority.receiveSteps(sendable.version, sendable.steps, sendable.clientID)
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
//     .where('stepId', '>', currentStepId)
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
