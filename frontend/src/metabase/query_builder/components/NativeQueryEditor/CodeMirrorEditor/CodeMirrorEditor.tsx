import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { forwardRef, useImperativeHandle, useRef } from "react";

import type { EditorProps, EditorRef } from "../Editor";

import S from "./CodeMirrorEditor.module.css";
import { useExtensions } from "./util";

type CodeMirrorEditorProps = EditorProps;

export const CodeMirrorEditor = forwardRef<EditorRef, CodeMirrorEditorProps>(
  function CodeMirrorEditor(props, ref) {
    const editor = useRef<ReactCodeMirrorRef>(null);
    const { query, onChange } = props;
    const extensions = useExtensions();

    useImperativeHandle(ref, () => {
      return {
        focus() {
          editor.current?.editor?.focus();
        },
        resize() {
          // noop
        },
        getSelectionTarget() {
          return null;
        },
      };
    }, []);

    return (
      <CodeMirror
        ref={editor}
        className={S.editor}
        extensions={extensions}
        value={query.queryText()}
        onChange={onChange}
      />
    );
  },
);
