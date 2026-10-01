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

/**
 * `index` is null while the pill is a draft, with no clause in the query yet.
 * `session` keys the editor and survives the draft becoming a real clause —
 * autosave flips `index` mid-typing, and remounting due to changed key would drop the caret.
 */
type OpenEditor = { index: number | null; session: number };

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
  const sessionRef = useRef(0);

  const openEditorAt = useCallback((index: number | null) => {
    sessionRef.current += 1;
    setOpenEditor({ index, session: sessionRef.current });
  }, []);

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
      openEditorAt(null);
    }
  }, [isLastOpened, isEditorLoaded, readOnly, openEditorAt]);

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
      if (openEditor == null) {
        return;
      }

      const currentQuery = queryRef.current;
      const currentExpressions = Lib.expressions(currentQuery, stageIndex);
      const { index } = openEditor;
      const existing = index != null ? currentExpressions[index] : undefined;

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
      } else {
        commitQuery(
          Lib.expression(currentQuery, stageIndex, uniqueName, namedClause),
        );
        // Further edits now replace rather than append another column.
        setOpenEditor({
          index: currentExpressions.length,
          session: openEditor.session,
        });
      }
    },
    [openEditor, stageIndex, commitQuery],
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

      if (openEditor?.index === index) {
        setOpenEditor(null);
      }
      commitQuery(Lib.removeClause(currentQuery, stageIndex, expression));
    },
    [stageIndex, openEditor, commitQuery],
  );

  const handleReorder = useCallback(
    (
      sourceClause: Lib.ExpressionClause,
      targetClause: Lib.ExpressionClause,
    ) => {
      setOpenEditor(null);
      commitQuery(
        Lib.swapClauses(
          queryRef.current,
          stageIndex,
          sourceClause,
          targetClause,
        ),
      );
    },
    [stageIndex, commitQuery],
  );

  const handleDiscard = useCallback(() => {
    setOpenEditor(null);
  }, []);

  const editedExpression =
    openEditor?.index != null ? expressions[openEditor.index] : undefined;

  const availableColumns = useMemo(
    () =>
      Lib.expressionableColumns(
        query,
        stageIndex,
        openEditor?.index ?? undefined,
      ),
    [query, stageIndex, openEditor],
  );

  const isDraftOpen = openEditor != null && openEditor.index == null;

  return (
    <>
      <NotebookCell color={color}>
        <ClauseStepDndContext items={expressions} onReorder={handleReorder}>
          {expressions.map((expression, index) => (
            <ClauseStepDndItem key={index} index={index} readOnly={!!readOnly}>
              <ExpressionPill
                name={getExpressionName(expression)}
                color={color}
                isActive={openEditor?.index === index}
                readOnly={readOnly}
                onOpen={() => openEditorAt(index)}
                onRename={(name) => handleRename(index, name)}
                onRemove={() => handleRemove(index)}
              />
            </ClauseStepDndItem>
          ))}
        </ClauseStepDndContext>

        {isDraftOpen && (
          <ExpressionPill
            name={t`New column`}
            color={color}
            isActive
            readOnly
            hasRemoveButton={false}
            onOpen={noop}
            onRename={noop}
            onRemove={noop}
          />
        )}

        {!readOnly && (
          <NotebookCellAdd color={color} onClick={() => openEditorAt(null)} />
        )}
      </NotebookCell>

      {openEditor != null && isEditorLoaded && (
        <InlineExpressionEditor
          key={openEditor.session}
          query={query}
          stageIndex={stageIndex}
          expressionIndex={openEditor.index ?? undefined}
          expressionMode="expression"
          availableColumns={availableColumns}
          reportTimezone={reportTimezone}
          readOnly={readOnly}
          clause={editedExpression}
          onCommit={handleCommit}
          onDone={handleDiscard}
          onDiscard={handleDiscard}
        />
      )}
    </>
  );
};

const noop = () => {};

const getUniqueClauseName = (
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.ExpressionClause | undefined,
  name: string,
) => {
  const isUpdate = clause != null;
  // exclude the current clause so that it can be updated without renaming
  const queryWithoutCurrentClause = isUpdate
    ? Lib.removeClause(query, stageIndex, clause)
    : query;
  const expressions = Lib.expressions(queryWithoutCurrentClause, stageIndex);
  const expressionsObject = Object.fromEntries(
    expressions.map((expression) => [
      Lib.displayInfo(query, stageIndex, expression).displayName,
    ]),
  );
  const uniqueName = getUniqueExpressionName(expressionsObject, name);
  return uniqueName;
};
