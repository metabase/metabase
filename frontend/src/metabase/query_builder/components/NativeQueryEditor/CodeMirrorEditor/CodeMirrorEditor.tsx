import CodeMirror, {
  type ReactCodeMirrorRef,
  type ViewUpdate,
} from "@uiw/react-codemirror";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import type { EditorProps, EditorRef } from "../Editor";

import S from "./CodeMirrorEditor.module.css";
import { convertIndexToPosition, useExtensions } from "./util";

type CodeMirrorEditorProps = EditorProps;

export const CodeMirrorEditor = forwardRef<EditorRef, CodeMirrorEditorProps>(
  function CodeMirrorEditor(props, ref) {
    const editor = useRef<ReactCodeMirrorRef>(null);
    const { query, onChange, readOnly, onSelectionChange } = props;
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

    const handleUpdate = useCallback(
      (update: ViewUpdate) => {
        // handle selection changes
        const value = update.state.doc.toString();
        if (onSelectionChange) {
          onSelectionChange({
            start: convertIndexToPosition(
              value,
              update.state.selection.main.from,
            ),
            end: convertIndexToPosition(value, update.state.selection.main.to),
          });
        }
      },
      [onSelectionChange],
    );

    return (
      <CodeMirror
        ref={editor}
        className={S.editor}
        extensions={extensions}
        value={query.queryText()}
        readOnly={readOnly}
        onChange={onChange}
        height="100%"
        onUpdate={handleUpdate}
      />
    );
  },
);
