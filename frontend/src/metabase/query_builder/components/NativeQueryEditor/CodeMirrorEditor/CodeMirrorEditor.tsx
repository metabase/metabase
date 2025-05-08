import CodeMirror, {
  type ReactCodeMirrorRef,
  type ViewUpdate,
} from "@uiw/react-codemirror";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import _ from "underscore";

import { isEventOverElement } from "metabase/lib/dom";
import * as Lib from "metabase-lib";
import type { CardId } from "metabase-types/api";

import type { SelectionRange } from "../types";

export type CodeMirrorEditorProps = {
  query: Lib.Query;
  highlightedLineNumbers?: number[];
  readOnly?: boolean;
  onChange?: (queryText: string) => void;
  onRunQuery?: () => void;
  onCursorMoveOverCardTag?: (id: CardId) => void;
  onRightClickSelection?: () => void;
  onSelectionChange?: (range: SelectionRange[]) => void;
};

export interface CodeMirrorEditorRef {
  focus: () => void;
  getSelectionTarget: () => Element | null;
}

import S from "./CodeMirrorEditor.module.css";
import { useExtensions, useHighlightLines } from "./extensions";
import {
  getPlaceholderText,
  getSelectedRanges,
  matchCardIdAtCursor,
} from "./util";

export const CodeMirrorEditor = forwardRef<
  CodeMirrorEditorRef,
  CodeMirrorEditorProps
>(function CodeMirrorEditor(
  {
    query,
    highlightedLineNumbers,
    readOnly,
    onChange,
    onRunQuery,
    onSelectionChange,
    onRightClickSelection,
    onCursorMoveOverCardTag,
  },
  ref,
) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const extensions = useExtensions({ query, onRunQuery });
  useHighlightLines(editorRef, highlightedLineNumbers);

  const engine = Lib.engine(query);
  const placeholder = getPlaceholderText(engine);

  useImperativeHandle(ref, () => {
    return {
      focus() {
        editorRef.current?.editor?.focus();
      },
      getSelectionTarget() {
        return document.querySelector(".cm-selectionBackground");
      },
    };
  }, []);

  const handleUpdate = useCallback(
    (update: ViewUpdate) => {
      // handle selection changes
      if (onSelectionChange) {
        const beforeRanges = getSelectedRanges(update.startState);
        const afterRanges = getSelectedRanges(update.state);

        if (!_.isEqual(beforeRanges, afterRanges)) {
          onSelectionChange(afterRanges);
        }
      }
      if (onCursorMoveOverCardTag) {
        if (
          update.startState.selection.main.head !==
          update.state.selection.main.head
        ) {
          const cardId = matchCardIdAtCursor(update.state);
          if (cardId !== null) {
            onCursorMoveOverCardTag(cardId);
          }
        }
      }
    },
    [onSelectionChange, onCursorMoveOverCardTag],
  );

  useEffect(() => {
    function handler(evt: MouseEvent) {
      const selection = editorRef.current?.state?.selection.main;
      if (!selection) {
        return;
      }

      const selections = Array.from(
        document.querySelectorAll(".cm-selectionBackground"),
      );

      if (selections.some((selection) => isEventOverElement(evt, selection))) {
        evt.preventDefault();
        onRightClickSelection?.();
      }
    }
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, [onRightClickSelection]);

  return (
    <CodeMirror
      ref={editorRef}
      data-testid="native-query-editor"
      className={S.editor}
      extensions={extensions}
      value={Lib.rawNativeQuery(query)}
      readOnly={readOnly}
      onChange={onChange}
      height="100%"
      onUpdate={handleUpdate}
      autoFocus
      placeholder={placeholder}
    />
  );
});
