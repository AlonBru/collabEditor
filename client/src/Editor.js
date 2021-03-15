import React, { SyntheticEvent,useEffect, useLayoutEffect, useRef, useState } from 'react';
import Draft, { Editor, EditorState, RichUtils, convertToRaw, convertFromHTML, Modifier, CompositeDecorator, DraftHandleValue, RawDraftEntityRange } from 'draft-js';
import styled from 'styled-components';
import './RichText.css'

import _UL from './images/list_unordered.svg'
import _OL from './images/list_ordered.svg'


const Container = styled.div`
  /* padding:5px 0 ; */
  box-shadow: 1px 1px 3px #aaa;
  /* border:1px solid black; */
`
const EditorContainer = styled.div`
  /* margin-top:10px; */
  padding:15px;
  max-height: 15em;
  min-height: 10em;
  /* overflow-y:auto;   */
  background-color: rgb(232 238 244 / 47%);
  border: none;
  resize: none;
  width: 100%;
  font-family: inherit;
  border-bottom: 2px solid #e7eaf0;
  color: #0a2138;
  background-color: rgb(232 238 244 / 47%);
  font-size: 16px;
  font-weight: 400;

`
const StyleButton = styled.button`
  /* border:1px solid black; */
  border:none;
  height:2rem;
  min-width:2rem;
  padding:.2rem;
  transition:.2s;
  outline:none;
  &.active{
    background:${({theme})=>theme.colors.primary} !important;
    /* color:${({theme})=>theme.colors.textLight}; */
    color:white;
    path{
      fill:white;
    }

    &:hover{
      color:black;
    }
  }
  &:focus{
    outline:antiquewhite solid; 
  }
  &:hover{
    border-radius:.6em;
    background-color:${({theme})=>theme.colors.hoverLight}
  }
`
const Buttons = styled.section`
display:flex;
/* justify-content:space-evenly; */
border-bottom:1px solid #eee;
`
const OL = styled(_OL)`
height:100%;
`
const UL = styled(_UL)`
height:100%;
`
const Label = styled.span`
  sub,sup{
    color:blue;
    font-weight:600;
    line-height: 0px;
    padding-left:1px;
  }
`

const UListLabel =  <Label><UL/></Label>
const OListLabel =  <Label><OL/></Label>

function getBlockStyle(block) {
  switch (block.getType()) {
    case 'blockquote':
      return 'RichEditor-blockquote';
    default:
      return '';
  }
}
const BLOCK_TYPES = [
  { label: 'H1', style: 'header-one', title:'Top Header' },
  { label: 'H2', style: 'header-two', title:'Secondary Header' },
  { label: 'H3', style: 'header-three', title:'Minor Header' },
  // { label: 'H4', style: 'header-four' },
  // { label: 'H5', style: 'header-five' },
  // { label: 'H6', style: 'header-six' },
  // { label: '“ ”', style: 'blockquote', title:'Block Quote', look:{fontSize:'x-large',} },
  { label: 'UL', style: 'unordered-list-item', title:'Bullet List', element:UListLabel },
  { label: 'OL', style: 'ordered-list-item', title:'Numbered List', element:OListLabel },
  //TODO: { label: 'Code Block', style: 'code-block', title:'Code Block' },
];
const BlockStyleControls = (props) => {
  const { editorState } = props;
  const selection = editorState.getSelection();
  const blockType = editorState
  .getCurrentContent()
  .getBlockForKey(selection.getStartKey())
  .getType();
  
  return (
    <>
      {BLOCK_TYPES.map(type =>
        <StyleButton
        key={type.label}
        onClick={(e:SyntheticEvent) => {
          e.preventDefault();
          props.onToggle(type.style);
        }}
        className={type.style === blockType?'active':''}
        title={type.title}
        style={type.look}
        >
          {type.element||type.label}
          </StyleButton>
      )}
    </>
  );
};
const INLINE_STYLES = [
  { label: 'B', style: 'BOLD' , look:{fontWeight:600}, title:'Bold: ctrl+B'},
  { label: 'I', style: 'ITALIC', look:{fontStyle:'italic',fontFamily:'serif',lineHeight:'1.3em'},title:'Italic: ctrl+I' },
  { label: 'U', style: 'UNDERLINE', look:{textDecoration:'underline',textDecorationWidth:'1px'}, title:'Underline: ctrl+U' },
  // <strike> tag not suppored in HTML 5. laso kinda pointless... 
  // { label: 'ab', style: 'STRIKETHROUGH', look:{textDecoration:'line-through maroon 2px'}, title:'Strikethrough' },
  //TODO: make them readable for the display 
  // { label: 'SubScript', style: 'SUBSCRIPT', element:SubScriptLabel, title:'Subscript' },
  // { label: 'SupScript', style: 'SUPERSCRIPT', element:SupScriptLabel, title:'Superscript' },
  // { label: 'code', style: 'CODE', look:{fontFamily:'monospace', lineHeight:'1.3em'}, title:'Monospace' },
];

const InlineStyleControls = (props) => {
  const currentStyle = props.editorState.getCurrentInlineStyle();
  return (
    <>
      {INLINE_STYLES.map(type =>
        <StyleButton
          type="button"
          key={String(type.label)}
          onMouseDown={(e:SyntheticEvent) => {
            e.preventDefault();
            props.onToggle(type.style);
          }}
          // onClick={(e:SyntheticEvent) => {
          //   e.preventDefault();
          //   props.onToggle(type.style);
          // }}
          className={currentStyle.has(type.style)?'active':''}
          style={type.look}
          title={type.title}
          >
          {type.element||type.label}
          </StyleButton>
      )}
    </>
  );
};



function TextEditor (props) {
  const [editorState,setEditorState ] = useState(
    // props.initialValue
    // ? EditorState.createWithContent(
    //   // importHTML(props.initialValue)||Draft.ContentState.createFromText(props.initialValue),
    //   importHTML(stripAnchors(props.initialValue))||Draft.ContentState.createFromText(props.initialValue),
    //   // TODO 
    //   decorator
    //   ) 
    //   : EditorState.createEmpty(
    //   // TODO 
    //   decorator
    //   )
    getEditorState(props.initialValue,members)
  )
  const [ extraEditorLogic, setExtraEditorLogic] = useState<EditorLogic>({})
  
  const ref = useRef<Editor|null>(null)

  const focus = () => {
      if(ref.current){
  
        ref.current.focus()
      }
  };

  useEffect(
    ()=>{
      const setEditorStateAndUpdateRanges =(editorState) =>{
        setEditorState(editorState)
      }    
      setEditorState(
        EditorState.set(
          editorState, 
          {
            decorator: new CompositeDecorator([
              linkDecorator,
              createMentionDecorator(editorState,setEditorStateAndUpdateRanges,setExtraEditorLogic)
            ])
          }
        )
      )
    },
    [editorState.getCurrentContent()]
  )
  
  
  
  const onChange = (newEditorState:EditorState) => {
    setEditorState(newEditorState);
    const ranges = extractRanges(newEditorState)
    const plaintext = convertToRaw(newEditorState.getCurrentContent()).blocks
    .map(block=>block.text).join('\n')
    props.onChange(
      extractHTML(newEditorState.getCurrentContent()),
      plaintext,
      ranges
    )
  };
  
  const handleKeyCommand = (command:string ):Draft.DraftHandleValue => {
    if(extraEditorLogic.onEnter&& command === 'split-block' ){
      return extraEditorLogic.onEnter()
    }
    const newState = RichUtils.handleKeyCommand(editorState, command);
    if (newState) {
      onChange(newState);
      return 'handled';
    }
    return 'not-handled';
  };

  const onTab = (e:any) => {
    const maxDepth = 2;
    onChange(RichUtils.onTab(e, editorState, maxDepth));
  };

  const toggleBlockType = (blockType:string) => {
    new Promise ((res,rej):void=>{
      onChange(RichUtils.toggleBlockType(editorState, blockType))
      res(undefined)
    })
    .then(()=>focus())
    // focus()
  };
  
  const toggleInlineStyle = (inlineStyle:string) => {
    onChange(
      RichUtils.toggleInlineStyle(editorState, inlineStyle)
      )
  };
  // If the user changes block type before entering any text, we can
  // either style the placeholder or hide it. Let's just hide it now.
  let className = 'RichEditor-editor';
  const contentState = editorState.getCurrentContent();
    // if (!contentState.hasText()) {
    //   if (contentState.getBlockMap().first().getType() !== 'unstyled') {
    //     className += ' RichEditor-hidePlaceholder';
    //   }
    // }
    return (
      <Container className="RichEditor-root"
      //  onClick={()=>console.log(editorState.getCurrentContent())}
      >
        {/* <button type="button" onClick={()=>{
          try{
            
            console.log(
                extractHTML( contentState)
                );
            }catch{

            }
          }} >
          exxport
        </button> */}
        {/* <button type="button" onClick={()=>{
          const contentStateWithEntity = contentState.createEntity('MENTION', 'MUTABLE', {
            url: 'http://www.zombo.com',
          });
          const selectionState = editorState.getSelection()
          const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
          const contentStateWithLink = Modifier.applyEntity(
            contentStateWithEntity,
            selectionState,
            entityKey,
          );
          const newEditorState = EditorState.set(editorState, {
            currentContent: contentStateWithLink,
          });
          setEditorState(newEditorState)
          
        }} >
          blorp
        </button> */}
        {!(props.readonly)&& <Buttons>
          <InlineStyleControls
            editorState={editorState}
            onToggle={toggleInlineStyle}
          />
          <BlockStyleControls
            editorState={editorState}
            onToggle={toggleBlockType}
          />
        </Buttons>}
        <EditorContainer 
        className={className} 
        onClick={focus}
        >
          <Editor
            tabIndex={props.tabIndex}
            readOnly={props.readonly}
            blockStyleFn={getBlockStyle}
            customStyleMap={styleMap}
            editorState={editorState}
            handleKeyCommand={handleKeyCommand}
            onChange={onChange}
            onTab={onTab}
            placeholder={props.placeholder||"Type here"}
            ref={ref}
            spellCheck={true}
            onEscape={e=>{
              e.stopPropagation()
              
            }}
            {...extraEditorLogic}
          />
        </EditorContainer>
          {/* {props.initialValue} */}
      </Container>
    );
  
}

export default React.memo(TextEditor)


