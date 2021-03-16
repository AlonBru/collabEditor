// import React from 'react'
// import {EditorState} from "prosemirror-state"
// import {EditorView} from "prosemirror-view"
// import {DOMParser, Schema} from "prosemirror-model"
// import {schema} from "prosemirror-schema-basic"
// import {addListNodes} from "prosemirror-schema-list"
// import {exampleSetup} from "prosemirror-example-setup"



// class ProseMirrorEditorView extends React.Component {
//   props: {
//     /**
//      * EditorState instance to use.
//      */
//     editorState: EditorState,

//     /**
//      * Called when EditorView produces new EditorState.
//      */
//     onEditorState: (EditorState:EditorState) => any,
//   };

//   _editorView?: EditorView;

//   _createEditorView = (element?: HTMLElement) => {
//     if (element != null) {
//       this._editorView = new EditorView(element, {
//         state: this.props.editorState,
//         dispatchTransaction: this.dispatchTransaction,
//       });
//     }
//   };

//   dispatchTransaction = (tx: any) => {
//     // In case EditorView makes any modification to a state we funnel those
//     // modifications up to the parent and apply to the EditorView itself.
//     const editorState = this.props.editorState.apply(tx);
//     if (this._editorView != null) {
//       this._editorView.updateState(editorState);
//     }
//     this.props.onEditorState(editorState);
//   };

//   focus() {
//     if (this._editorView) {
//       this._editorView.focus();
//     }
//   }

//   componentWillReceiveProps(nextProps) {
//     // In case we receive new EditorState through props — we apply it to the
//     // EditorView instance.
//     if (this._editorView) {
//       if (nextProps.editorState !== this.props.editorState) {
//         this._editorView.updateState(nextProps.editorState);
//       }
//     }
//   }

//   componentWillUnmount() {
//     if (this._editorView) {
//       this._editorView.destroy();
//     }
//   }

//   shouldComponentUpdate() {
//     // Note that EditorView manages its DOM itself so we'd ratrher don't mess
//     // with it.
//     return false;
//   }

//   render() {
//     // Render just an empty div which is then used as a container for an
//     // EditorView instance.
//     return <div ref={this._createEditorView} />;
//   }
// }
// export default class RichTextEditor extends React.Component {
//   state: {editorState: EditorState};

//   constructor(props: RichTextEditorProps) {
//     super(props);
//     this.state = {
//       editorState: EditorState.create(...)
//     };
//   }

//   dispatchTransaction = (tx: any) => {
//     const editorState = this.state.editorState.apply(tx);
//     this.setState({editorState});
//   };

//   onEditorState = (editorState: EditorState) => {
//     this.setState({editorState});
//   };

//   render() {
//     const {editorState} = this.state;
//     return (
//       <div>
//         <div class="menu">
//           <UndoMenuButton
//             editorState={editorState}
//             dispatchTransaction={this.dispatchTransaction}
//           />
//         </div>
//         <div class="editorview-wrapper">
//           <ProseMirrorEditorView
//             ref={this.onEditorView}
//             editorState={editorState}
//             onEditorState={this.onEditorState}
//           />
//         </div>
//       </div>
//     );
//   }
// }