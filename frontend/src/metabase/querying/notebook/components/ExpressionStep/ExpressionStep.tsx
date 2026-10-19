import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { useTranslateContent } from "metabase/content-translation/hooks";
import * as Lib from "metabase-lib";
import { getUniqueExpressionName } from "metabase-lib/v1/queries/utils/expression";

import type { NotebookStepProps } from "../../types";
import { ClauseStepDndContext, ClauseStepDndItem } from "../ClauseStep";
import {
  InlineExpressionEditor,
  useInlineExpressionEditorChunk,
} from "../InlineExpressionEditor";
import { NotebookCell, NotebookCellAdd } from "../NotebookCell";

import { ExpressionPill } from "./ExpressionPill";

type EditorTarget =
  | { kind: "clause"; index: number }
  | { kind: "draft"; id: string };

type OpenEditor = { target: EditorTarget; session: number };

export const ExpressionStep = ({
  color,
  updateQuery,
  isLastOpened,
  reportTimezone,
  readOnly,
  step,
}: NotebookStepProps): JSX.Element => {
  const { query, stageIndex } = step;
  const tc = useTranslateContent();

  const isEditorLoaded = useInlineExpressionEditorChunk();

  const [openEditor, setOpenEditor] = useState<OpenEditor | null>(null);
  // The debounced edit and the blur after it both commit, faster than React
  // re-renders, so the target has to be readable synchronously.
  const openEditorRef = useRef<OpenEditor | null>(null);

  const setOpen = useCallback((next: OpenEditor | null) => {
    openEditorRef.current = next;
    setOpenEditor(next);
  }, []);

  const [draftIds, setDraftIds] = useState<string[]>([]);
  const sessionRef = useRef(0);
  const draftCountRef = useRef(0);

  const [pendingSources, setPendingSources] = useState<Record<string, string>>(
    {},
  );

  const dropPendingSource = useCallback((target: EditorTarget) => {
    const key = pendingKey(target);
    setPendingSources((pending) => {
      if (!(key in pending)) {
        return pending;
      }
      const { [key]: _removed, ...rest } = pending;
      return rest;
    });
  }, []);

  const openEditorAt = useCallback(
    (target: EditorTarget) => {
      sessionRef.current += 1;
      setOpen({ target, session: sessionRef.current });
    },
    [setOpen],
  );

  const addDraft = useCallback(() => {
    draftCountRef.current += 1;
    const id = `draft-${draftCountRef.current}`;
    setDraftIds((ids) => [...ids, id]);
    openEditorAt({ kind: "draft", id });
  }, [openEditorAt]);

  const expressions = useMemo(
    () => Lib.expressions(query, stageIndex),
    [query, stageIndex],
  );

  // Autosave outpaces the query prop, so commits build on the latest result.
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    if (isLastOpened && isEditorLoaded && !readOnly) {
      addDraft();
    }
  }, [isLastOpened, isEditorLoaded, readOnly, addDraft]);

  const getExpressionName = useCallback(
    (expression: Lib.ExpressionClause) =>
      tc(Lib.displayInfo(query, stageIndex, expression).displayName),
    [tc, query, stageIndex],
  );

  const commitQuery = useCallback(
    (nextQuery: Lib.Query) => {
      queryRef.current = nextQuery;
      updateQuery(nextQuery);
    },
    [updateQuery],
  );

  const handleCommit = useCallback(
    (clause: Lib.ExpressionClause) => {
      const editor = openEditorRef.current;
      if (editor == null) {
        return;
      }

      const currentQuery = queryRef.current;
      const currentExpressions = Lib.expressions(currentQuery, stageIndex);
      const { target } = editor;
      const existing =
        target.kind === "clause" ? currentExpressions[target.index] : undefined;

      const name = existing
        ? Lib.displayInfo(currentQuery, stageIndex, existing).displayName
        : t`New column`;
      const uniqueName = getUniqueClauseName(
        currentQuery,
        stageIndex,
        existing,
        name,
      );
      const namedClause = Lib.withExpressionName(clause, uniqueName);

      if (existing) {
        commitQuery(
          Lib.replaceClause(currentQuery, stageIndex, existing, namedClause),
        );
        return;
      }

      commitQuery(
        Lib.expression(currentQuery, stageIndex, uniqueName, namedClause),
      );

      if (target.kind === "draft") {
        dropPendingSource(target);
        setDraftIds((ids) => ids.filter((id) => id !== target.id));
        setOpen({
          target: { kind: "clause", index: currentExpressions.length },
          session: editor.session,
        });
      }
    },
    [stageIndex, commitQuery, dropPendingSource, setOpen],
  );

  const handleRename = useCallback(
    (index: number, name: string) => {
      const currentQuery = queryRef.current;
      const expression = Lib.expressions(currentQuery, stageIndex)[index];
      if (!expression) {
        return;
      }

      const uniqueName = getUniqueClauseName(
        currentQuery,
        stageIndex,
        expression,
        name,
      );
      commitQuery(
        Lib.replaceClause(
          currentQuery,
          stageIndex,
          expression,
          Lib.withExpressionName(expression, uniqueName),
        ),
      );
    },
    [stageIndex, commitQuery],
  );

  const handleRemove = useCallback(
    (index: number) => {
      const currentQuery = queryRef.current;
      const expression = Lib.expressions(currentQuery, stageIndex)[index];
      if (!expression) {
        return;
      }

      const editor = openEditorRef.current;
      if (editor?.target.kind === "clause" && editor.target.index === index) {
        setOpen(null);
      }
      setPendingSources((pending) =>
        Object.fromEntries(
          Object.entries(pending).filter(([key]) => key.startsWith("draft:")),
        ),
      );
      commitQuery(Lib.removeClause(currentQuery, stageIndex, expression));
    },
    [stageIndex, commitQuery, setOpen],
  );

  const handleReorder = useCallback(
    (
      sourceClause: Lib.ExpressionClause,
      targetClause: Lib.ExpressionClause,
    ) => {
      setOpen(null);
      setPendingSources((pending) =>
        Object.fromEntries(
          Object.entries(pending).filter(([key]) => key.startsWith("draft:")),
        ),
      );
      commitQuery(
        Lib.swapClauses(
          queryRef.current,
          stageIndex,
          sourceClause,
          targetClause,
        ),
      );
    },
    [stageIndex, commitQuery, setOpen],
  );

  const discardDraft = useCallback(
    (id: string) => {
      dropPendingSource({ kind: "draft", id });
      setDraftIds((ids) => ids.filter((draftId) => draftId !== id));
      const editor = openEditorRef.current;
      if (editor?.target.kind === "draft" && editor.target.id === id) {
        setOpen(null);
      }
    },
    [dropPendingSource, setOpen],
  );

  const handleDiscard = useCallback(() => {
    const editor = openEditorRef.current;
    if (editor == null) {
      return;
    }
    const { target } = editor;
    if (target.kind === "draft") {
      discardDraft(target.id);
      return;
    }
    dropPendingSource(target);
    setOpen(null);
  }, [discardDraft, dropPendingSource, setOpen]);

  const handleSourceChange = useCallback((source: string, isValid: boolean) => {
    const editor = openEditorRef.current;
    if (editor == null) {
      return;
    }
    const key = pendingKey(editor.target);
    setPendingSources((pending) => {
      if (isValid) {
        if (!(key in pending)) {
          return pending;
        }
        const { [key]: _removed, ...rest } = pending;
        return rest;
      }
      return pending[key] === source ? pending : { ...pending, [key]: source };
    });
  }, []);

  const openTarget = openEditor?.target;
  const editedIndex = openTarget?.kind === "clause" ? openTarget.index : null;
  const editedExpression =
    editedIndex != null ? expressions[editedIndex] : undefined;

  const availableColumns = useMemo(
    () =>
      Lib.expressionableColumns(query, stageIndex, editedIndex ?? undefined),
    [query, stageIndex, editedIndex],
  );

  return (
    <>
      <NotebookCell color={color}>
        <ClauseStepDndContext items={expressions} onReorder={handleReorder}>
          {expressions.map((expression, index) => (
            <ClauseStepDndItem key={index} index={index} readOnly={!!readOnly}>
              <ExpressionPill
                name={getExpressionName(expression)}
                color={color}
                isActive={editedIndex === index}
                readOnly={readOnly}
                hasUnsavedChanges={
                  pendingKey({ kind: "clause", index }) in pendingSources
                }
                onOpen={() => openEditorAt({ kind: "clause", index })}
                onRename={(name) => handleRename(index, name)}
                onRemove={() => handleRemove(index)}
              />
            </ClauseStepDndItem>
          ))}
        </ClauseStepDndContext>

        {draftIds.map((id) => (
          <ExpressionPill
            key={id}
            name={t`New column`}
            color={color}
            isActive={openTarget?.kind === "draft" && openTarget.id === id}
            readOnly={readOnly}
            canRename={false}
            hasUnsavedChanges
            onOpen={() => openEditorAt({ kind: "draft", id })}
            onRename={noop}
            onRemove={() => discardDraft(id)}
          />
        ))}

        {!readOnly && <NotebookCellAdd color={color} onClick={addDraft} />}
      </NotebookCell>

      {openEditor != null && isEditorLoaded && (
        <InlineExpressionEditor
          key={openEditor.session}
          query={query}
          stageIndex={stageIndex}
          expressionIndex={editedIndex ?? undefined}
          expressionMode="expression"
          availableColumns={availableColumns}
          reportTimezone={reportTimezone}
          readOnly={readOnly}
          clause={editedExpression}
          initialSource={pendingSources[pendingKey(openEditor.target)]}
          onSourceChange={handleSourceChange}
          onCommit={handleCommit}
          onDone={handleDiscard}
          onDiscard={handleDiscard}
        />
      )}
    </>
  );
};

const noop = () => {};

const pendingKey = (target: EditorTarget) =>
  target.kind === "clause" ? `clause:${target.index}` : `draft:${target.id}`;

const getUniqueClauseName = (
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.ExpressionClause | undefined,
  name: string,
) => {
  // exclude the current clause so that it can be updated without renaming
  const queryWithoutCurrentClause =
    clause != null ? Lib.removeClause(query, stageIndex, clause) : query;
  const uniqueName = getUniqueExpressionName(
    queryWithoutCurrentClause,
    stageIndex,
    name,
  );
  return uniqueName;
};
