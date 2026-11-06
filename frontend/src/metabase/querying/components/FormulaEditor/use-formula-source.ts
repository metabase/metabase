import type { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLatest } from "react-use";

import { format } from "metabase/querying/expressions";
import type * as Lib from "metabase-lib";

import type { FormulaEditorProps } from "./types";

type Options = Pick<
  FormulaEditorProps,
  "query" | "stageIndex" | "initialClause" | "initialSource" | "onEditorCreate"
> & {
  availableColumns: Lib.ColumnMetadata[];
  onChange: () => void;
};

export function useFormulaSource({
  query,
  stageIndex,
  initialClause,
  initialSource = "",
  availableColumns,
  onEditorCreate,
  onChange,
}: Options) {
  const [source, setSource] = useState(initialSource);
  const [editedClause] = useState(initialClause);
  const hasTyped = useRef(false);
  const viewRef = useRef<EditorView | null>(null);
  const pendingCaret = useRef(false);
  const sourceRef = useLatest(source);
  const callbacks = useLatest({ onChange, onEditorCreate });

  useEffect(() => {
    if (editedClause == null) {
      return;
    }
    let cancelled = false;
    format(editedClause, {
      query,
      stageIndex,
      availableColumns,
      printWidth: Infinity,
    })
      .then((formula) => {
        if (!cancelled && !hasTyped.current) {
          pendingCaret.current = true;
          setSource(formula);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [editedClause, query, stageIndex, availableColumns]);

  const moveCaretToEnd = useCallback(() => {
    const view = viewRef.current;
    if (
      pendingCaret.current &&
      view?.state.doc.toString() === sourceRef.current
    ) {
      pendingCaret.current = false;
      view.dispatch({ selection: { anchor: view.state.doc.length } });
    }
  }, [sourceRef]);

  useEffect(moveCaretToEnd, [source, moveCaretToEnd]);

  const handleChange = useCallback(
    (value: string) => {
      if (value === sourceRef.current) {
        return;
      }
      hasTyped.current = true;
      setSource(value);
      callbacks.current.onChange();
    },
    [sourceRef, callbacks],
  );

  const handleCreate = useCallback(
    (view: EditorView) => {
      viewRef.current = view;
      view.focus();
      callbacks.current.onEditorCreate?.(view);
      moveCaretToEnd();
    },
    [callbacks, moveCaretToEnd],
  );

  return { source, hasTyped, handleChange, handleCreate };
}
