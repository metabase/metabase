import type { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import {
  FormulaEditor,
  type FormulaSourceStatus,
  type NamedExpression,
  editExpression,
  findExpression,
  isDefaultFormulaName,
  trackFormulaBarOpened,
} from "metabase/querying/components/FormulaEditor";
import { format } from "metabase/querying/expressions";
import { isNotNull } from "metabase/utils/types";
import type { ClickAction, ClickObject } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import { getUniqueExpressionName } from "metabase-lib/v1/queries/utils/expression";

import {
  FormulaBarFrame,
  useFormulaBarOwnership,
  useFormulaBarSlot,
} from "../FormulaBar";

import type {
  ColumnFormulaBar,
  ColumnFormulaBarOptions,
  ColumnFormulaDraft,
} from "./types";
import {
  findColumnExpression,
  findColumnLastStageExpression,
  withEditFormulaAction,
} from "./utils";

export function useColumnFormulaBar({
  question,
  readOnly = false,
  isActive = true,
  onQuestionChange,
  onEditSummaryFormula,
}: ColumnFormulaBarOptions): ColumnFormulaBar {
  const formulaBarSlot = useFormulaBarSlot();
  const {
    isActive: isOwner,
    open: claimOwnership,
    close: releaseOwnership,
  } = useFormulaBarOwnership();
  const [draft, setDraft] = useState<ColumnFormulaDraft | null>(null);
  const [shouldRestoreFocus, setShouldRestoreFocus] = useState(false);
  const nextKey = useRef(0);
  const viewRef = useRef<EditorView | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const { isNative, isEditable } = Lib.queryDisplayInfo(question.query());
  const isEnabled =
    isActive &&
    !isNative &&
    isEditable &&
    !readOnly &&
    !question.isArchived() &&
    formulaBarSlot != null;

  const { query, stageIndex } = useMemo(
    () =>
      isEnabled
        ? Lib.asReturned(question.query(), -1, question.id())
        : { query: question.query(), stageIndex: -1 },
    [question, isEnabled],
  );
  const editedExpression = useMemo(
    () =>
      draft?.kind === "edit"
        ? findExpression(query, stageIndex, draft.clause)
        : undefined,
    [query, stageIndex, draft],
  );
  const openDraft =
    draft?.kind === "new" || isNotNull(editedExpression) ? draft : null;

  const open = useCallback(() => {
    if (isOwner && draft?.kind === "new") {
      viewRef.current?.focus();
      return;
    }
    triggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    viewRef.current = null;
    nextKey.current += 1;
    setDraft({ kind: "new", key: nextKey.current });
    claimOwnership();
    trackFormulaBarOpened("table", "add_column_button");
  }, [isOwner, draft, claimOwnership]);

  const edit = useCallback(
    (expression: Lib.ExpressionClause) => {
      const isOpen =
        draft?.kind === "edit" && Lib.isSameClause(draft.clause, expression);
      if (isOwner && isOpen) {
        viewRef.current?.focus();
        return;
      }
      triggerRef.current = null;
      viewRef.current = null;
      nextKey.current += 1;
      const key = nextKey.current;
      setDraft({
        kind: "edit",
        key,
        clause: expression,
        source: "",
        sourceStatus: "loading",
      });
      claimOwnership();
      trackFormulaBarOpened("table", "column_header");
      // The printed formula only lands in its own draft, not in one that replaced it since.
      const showSource = (source: string, sourceStatus: FormulaSourceStatus) =>
        setDraft((current) =>
          current?.kind === "edit" && current.key === key
            ? { ...current, source, sourceStatus }
            : current,
        );
      format(expression, { query, stageIndex, printWidth: Infinity }).then(
        (source) => showSource(source, "ready"),
        () => showSource("", "failed"),
      );
    },
    [isOwner, draft, query, stageIndex, claimOwnership],
  );

  const close = useCallback(() => {
    setShouldRestoreFocus(true);
    releaseOwnership();
    setDraft(null);
    viewRef.current = null;
  }, [releaseOwnership]);

  useEffect(() => {
    if (!isEnabled || !isOwner) {
      setDraft(null);
      viewRef.current = null;
      releaseOwnership();
    }
  }, [isEnabled, isOwner, releaseOwnership]);

  const isEditedExpressionGone =
    isOwner && draft?.kind === "edit" && !editedExpression;
  useEffect(() => {
    if (isEditedExpressionGone) {
      close();
    }
  }, [isEditedExpressionGone, close]);

  useEffect(() => {
    if (!draft && shouldRestoreFocus) {
      setShouldRestoreFocus(false);
      if (triggerRef.current?.isConnected) {
        triggerRef.current.focus();
      }
    }
  }, [draft, shouldRestoreFocus]);

  const databaseId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    draft && databaseId != null ? { id: databaseId } : skipToken,
  );

  const mapClickActions = useCallback(
    (actions: ClickAction[], { column, value }: ClickObject) => {
      // only header clicks: a click on a cell or a chart point has a value
      if (!column || value !== undefined) {
        return actions;
      }
      const expression = findColumnExpression(query, stageIndex, column);
      if (expression) {
        return withEditFormulaAction(actions, () => edit(expression));
      }
      const groupingExpression = findColumnLastStageExpression(
        question.query(),
        column,
      );
      if (groupingExpression && onEditSummaryFormula) {
        return withEditFormulaAction(actions, () =>
          onEditSummaryFormula(groupingExpression),
        );
      }
      return actions;
    },
    [question, query, stageIndex, edit, onEditSummaryFormula],
  );

  const handleEditorCreate = (view: EditorView) => {
    viewRef.current = view;
    view.dispatch({ selection: { anchor: view.state.doc.length } });
  };

  const handleSubmit = (expression: NamedExpression) => {
    if (openDraft?.kind === "edit" && editedExpression) {
      // Replacing an unchanged formula still rewrites the clauses that refer to it, so skip it.
      const isChanged =
        openDraft.source !== viewRef.current?.state.doc.toString().trim();
      if (isChanged) {
        const { displayName } = Lib.displayInfo(
          query,
          stageIndex,
          editedExpression.clause,
        );
        const { query: nextQuery } = editExpression(
          query,
          stageIndex,
          editedExpression.clause,
          expression,
          !isDefaultFormulaName(displayName, openDraft.source),
        );
        onQuestionChange(question.setQuery(nextQuery), { isNewColumn: false });
      }
    } else {
      const { name, clause } = expression;
      const uniqueName = getUniqueExpressionName(query, stageIndex, name);
      const nextQuery = Lib.expression(query, stageIndex, uniqueName, clause);
      onQuestionChange(question.setQuery(nextQuery), { isNewColumn: true });
    }
    close();
  };

  const isEditing = openDraft?.kind === "edit";
  // the editor mounts once the edited formula has its text, as it reads it only on mount
  const isLoading = isEditing && openDraft.sourceStatus === "loading";
  const bar =
    formulaBarSlot &&
    createPortal(
      <FormulaBarFrame>
        {isEnabled && isOwner && openDraft && !isLoading ? (
          <FormulaEditor
            key={openDraft.key}
            query={query}
            stageIndex={stageIndex}
            database={database}
            expressionMode="expression"
            expressionIndex={editedExpression?.index}
            initialSource={isEditing ? openDraft.source : undefined}
            sourceStatus={isEditing ? openDraft.sourceStatus : undefined}
            submitLabel={isEditing ? t`Update` : t`Add column`}
            triggerLocation="table"
            onEditorCreate={handleEditorCreate}
            onSubmit={handleSubmit}
            onCancel={close}
          />
        ) : null}
      </FormulaBarFrame>,
      formulaBarSlot,
    );

  return {
    open: isEnabled ? open : undefined,
    mapClickActions: isEnabled ? mapClickActions : undefined,
    bar,
  };
}
