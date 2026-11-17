import { useCallback, useEffect, useRef, useState } from "react";

import type * as Lib from "metabase-lib";

import { useReportInlineEditorOpen } from "../NotebookStep/InlineEditorStateContext";

export type InlineEditorTarget =
  | { kind: "clause"; index: number }
  | { kind: "draft" };

type OpenEditor = {
  target: InlineEditorTarget;
  session: number;
  initialExpressionClause: Lib.DefinedClauseName | null;
};

type UseInlineClauseEditorOpts<T> = {
  query: Lib.Query;
  stageIndex: number;
  getClauses: (query: Lib.Query, stageIndex: number) => T[];
  addClause: (
    query: Lib.Query,
    stageIndex: number,
    clause: Lib.ExpressionClause,
  ) => Lib.Query;
  replaceClause: (
    query: Lib.Query,
    stageIndex: number,
    existing: T,
    clause: Lib.ExpressionClause,
  ) => Lib.Query;
  updateQuery: (query: Lib.Query) => void;
};

/**
 * The state of the inline expression editor of a filter or a summarize step.
 * Each valid edit saves the clause. The first save of a draft adds the clause,
 * and the editor then edits it.
 */
export function useInlineClauseEditor<T>({
  query,
  stageIndex,
  getClauses,
  addClause,
  replaceClause,
  updateQuery,
}: UseInlineClauseEditorOpts<T>) {
  const [openEditor, setOpenEditor] = useState<OpenEditor | null>(null);
  // The debounced edit and the blur after it both commit, faster than React
  // re-renders, so the target has to be readable synchronously.
  const openEditorRef = useRef<OpenEditor | null>(null);
  const sessionRef = useRef(0);

  const setOpen = useCallback((next: OpenEditor | null) => {
    openEditorRef.current = next;
    setOpenEditor(next);
  }, []);

  // Autosave outpaces the query prop, so commits build on the latest result.
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const open = useCallback(
    (
      target: InlineEditorTarget,
      initialExpressionClause: Lib.DefinedClauseName | null = null,
    ) => {
      sessionRef.current += 1;
      setOpen({ target, session: sessionRef.current, initialExpressionClause });
    },
    [setOpen],
  );

  const close = useCallback(() => setOpen(null), [setOpen]);

  const commit = useCallback(
    (clause: Lib.ExpressionClause) => {
      const editor = openEditorRef.current;
      if (editor == null) {
        return;
      }
      const currentQuery = queryRef.current;
      const clauses = getClauses(currentQuery, stageIndex);
      const { target } = editor;
      const existing =
        target.kind === "clause" ? clauses[target.index] : undefined;
      const nextQuery =
        existing != null
          ? replaceClause(currentQuery, stageIndex, existing, clause)
          : addClause(currentQuery, stageIndex, clause);
      queryRef.current = nextQuery;
      updateQuery(nextQuery);
      if (existing == null) {
        setOpen({
          ...editor,
          target: { kind: "clause", index: clauses.length },
        });
      }
    },
    [stageIndex, getClauses, addClause, replaceClause, updateQuery, setOpen],
  );

  /** Keeps the editor on its clause when an earlier clause goes. */
  const handleRemoved = useCallback(
    (index: number) => {
      const editor = openEditorRef.current;
      if (editor?.target.kind !== "clause") {
        return;
      }
      if (editor.target.index === index) {
        setOpen(null);
      } else if (editor.target.index > index) {
        setOpen({
          ...editor,
          target: { kind: "clause", index: editor.target.index - 1 },
        });
      }
    },
    [setOpen],
  );

  useReportInlineEditorOpen(openEditor != null);

  const target = openEditor?.target;
  const editedIndex = target?.kind === "clause" ? target.index : undefined;
  const clauses = getClauses(query, stageIndex);

  return {
    openEditor,
    editedIndex,
    editedClause: editedIndex != null ? clauses[editedIndex] : undefined,
    isDraftOpen: target?.kind === "draft",
    queryRef,
    open,
    close,
    commit,
    handleRemoved,
  };
}
