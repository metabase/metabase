import type { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { hasFeature } from "metabase/databases";
import {
  FormulaEditor,
  type NamedExpression,
  isDefaultFormulaName,
} from "metabase/querying/components/FormulaEditor";
import { format } from "metabase/querying/expressions";
import * as Lib from "metabase-lib";

import {
  FormulaBarFrame,
  useFormulaBarOwnership,
  useFormulaBarSlot,
} from "../../../FormulaBar";
import type { DraftFormulaChipHandle } from "../SummaryWells/DraftFormulaChip";
import type { SummaryWellId } from "../types";

import type {
  SummaryFormulaBarOptions,
  SummaryFormulaClause,
  SummaryFormulaDraft,
  SummaryFormulaInput,
} from "./types";
import {
  addSummaryFormula,
  editSummaryFormula,
  findSummaryFormula,
} from "./utils";

/** Text for the editor once its view exists, as the view mounts after the bar opens. */
type PendingSource =
  | { kind: "new"; wellId: SummaryWellId; source: string; onReady: () => void }
  | { kind: "edit"; source: string };

function getExpressionMode(wellId: SummaryWellId): Lib.ExpressionMode {
  return wellId === "values" ? "aggregation" : "expression";
}

function showSource(view: EditorView, source: string) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: source },
    selection: { anchor: source.length },
    userEvent: "input.type",
  });
}

export function useSummaryFormulaBar({
  query,
  stageIndex,
  isPivotMode,
  onAdd,
  onEdit,
}: SummaryFormulaBarOptions) {
  const slot = useFormulaBarSlot();
  const ownership = useFormulaBarOwnership();
  const [draft, setDraft] = useState<SummaryFormulaDraft | null>(null);
  const draftChipRef = useRef<DraftFormulaChipHandle>(null);
  const viewRef = useRef<EditorView | null>(null);
  const nextKey = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingSource = useRef<PendingSource | null>(null);
  const databaseId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    slot && databaseId != null ? { id: databaseId } : skipToken,
  );
  const activeDraft = ownership.isActive ? draft : null;
  const editedFormula = useMemo(
    () =>
      activeDraft?.kind === "edit"
        ? findSummaryFormula(
            query,
            stageIndex,
            activeDraft.wellId,
            activeDraft.uuid,
          )
        : null,
    [query, stageIndex, activeDraft],
  );
  const openDraft =
    activeDraft?.kind === "new" || editedFormula ? activeDraft : null;

  const handleDraftNameChange = useCallback(
    (name: string, source: string) =>
      draftChipRef.current?.setFormula(name, source),
    [],
  );

  const dropPendingSource = useCallback(() => {
    const pending = pendingSource.current;
    pendingSource.current = null;
    if (pending?.kind === "new") {
      pending.onReady();
    }
  }, []);

  useEffect(() => {
    if (!ownership.isActive) {
      setDraft(null);
      viewRef.current = null;
      dropPendingSource();
    }
  }, [ownership.isActive, dropPendingSource]);

  const releaseOwnership = ownership.close;
  const close = useCallback(() => {
    viewRef.current = null;
    dropPendingSource();
    setDraft(null);
    releaseOwnership();
    if (inputRef.current?.isConnected) {
      inputRef.current.focus();
    }
  }, [dropPendingSource, releaseOwnership]);

  // The edited chip can go away under the bar, from its remove button or Clear all.
  const isEditedFormulaGone = activeDraft?.kind === "edit" && !editedFormula;
  const isRowsWellGone = activeDraft?.wellId === "rows" && !isPivotMode;
  useEffect(() => {
    if (isEditedFormulaGone || isRowsWellGone) {
      close();
    }
  }, [isEditedFormulaGone, isRowsWellGone, close]);

  const handleSubmit = (expression: NamedExpression) => {
    if (activeDraft?.kind === "new") {
      onAdd(
        addSummaryFormula(query, stageIndex, activeDraft.wellId, expression),
        activeDraft.wellId,
      );
    } else if (activeDraft?.kind === "edit" && editedFormula) {
      // Replacing an unchanged formula still rewrites the clauses that refer to it, so skip it.
      const isChanged =
        activeDraft.originalSource !==
        viewRef.current?.state.doc.toString().trim();
      if (isChanged) {
        const result = editSummaryFormula(
          query,
          stageIndex,
          editedFormula,
          expression,
          activeDraft.hasCustomName,
        );
        onEdit(result.query, result.options);
      }
    }
    close();
  };

  const handleEditorCreate = (view: EditorView) => {
    viewRef.current = view;
    const pending = pendingSource.current;
    if (pending) {
      showSource(view, pending.source);
      dropPendingSource();
    }
  };

  // The bar opens at once and the printed formula lands in it, so a double-click's rename
  // keeps its focus. Text typed before the formula arrives stands.
  const showEditedSource = (key: number, source: string, name?: string) => {
    const hasCustomName = name != null && !isDefaultFormulaName(name, source);
    setDraft((draft) =>
      draft?.kind === "edit" && draft.key === key
        ? {
            ...draft,
            originalSource: source,
            sourceStatus: "ready",
            hasCustomName,
          }
        : draft,
    );
    const view = viewRef.current;
    if (view == null) {
      pendingSource.current = { kind: "edit", source };
    } else if (view.state.doc.length === 0) {
      showSource(view, source);
    }
  };

  const editFormula = (
    wellId: SummaryWellId,
    clause: SummaryFormulaClause,
    input: HTMLInputElement | null,
  ) => {
    const uuid = Lib.clauseUuid(clause);
    if (editedFormula?.uuid === uuid) {
      viewRef.current?.focus();
      return;
    }
    const formula = findSummaryFormula(query, stageIndex, wellId, uuid);
    if (!formula) {
      return;
    }
    viewRef.current = null;
    dropPendingSource();
    inputRef.current = input;
    nextKey.current += 1;
    const key = nextKey.current;
    setDraft({
      kind: "edit",
      key,
      wellId,
      uuid,
      source: "",
      sourceStatus: "loading",
      hasCustomName: formula.name != null,
    });
    ownership.open();
    // the bar holds one line, so the printer must not wrap
    format(formula.clause, { query, stageIndex, printWidth: Infinity }).then(
      (source) => {
        // a formula opened since, new or edited, has taken the bar
        if (nextKey.current === key) {
          showEditedSource(key, source, formula.name);
        }
      },
      () =>
        setDraft((draft) =>
          draft?.kind === "edit" && draft.key === key
            ? { ...draft, sourceStatus: "failed" }
            : draft,
        ),
    );
  };

  const getFormulaInput = (
    wellId: SummaryWellId,
  ): SummaryFormulaInput | undefined => {
    const feature =
      wellId === "values" ? "expression-aggregations" : "expressions";
    if (!slot || !database || !hasFeature(database, feature)) {
      return undefined;
    }
    return {
      start: (source, input, onReady) => {
        pendingSource.current = { kind: "new", wellId, source, onReady };
        inputRef.current = input;
        nextKey.current += 1;
        setDraft({ kind: "new", key: nextKey.current, wellId, source });
        ownership.open();
      },
      isPending: () =>
        pendingSource.current?.kind === "new" &&
        pendingSource.current.wellId === wellId,
      update: (source) => {
        const pending = pendingSource.current;
        if (pending?.kind === "new" && pending.wellId === wellId) {
          pending.source = source;
        }
      },
      edit: (clause, input) => editFormula(wellId, clause, input),
      cancelEdit: (clause) => {
        if (editedFormula?.uuid === Lib.clauseUuid(clause)) {
          close();
        }
      },
    };
  };

  const bar =
    slot &&
    createPortal(
      <FormulaBarFrame>
        {openDraft ? (
          <FormulaEditor
            key={openDraft.key}
            query={query}
            stageIndex={stageIndex}
            database={database}
            expressionMode={getExpressionMode(openDraft.wellId)}
            expressionIndex={editedFormula?.index}
            initialSource={openDraft.source}
            sourceStatus={
              openDraft.kind === "edit" ? openDraft.sourceStatus : undefined
            }
            submitLabel={openDraft.kind === "edit" ? t`Update` : t`Add`}
            onEditorCreate={handleEditorCreate}
            onNameChange={
              openDraft.kind === "new" ? handleDraftNameChange : undefined
            }
            onSubmit={handleSubmit}
            onCancel={close}
          />
        ) : null}
      </FormulaBarFrame>,
      slot,
    );

  return {
    bar,
    draftFormula:
      openDraft?.kind === "new"
        ? {
            wellId: openDraft.wellId,
            draftKey: openDraft.key,
            handleRef: draftChipRef,
            onFocus: () => viewRef.current?.focus(),
            onCancel: close,
          }
        : null,
    editingFormulaUuid: editedFormula?.uuid,
    formulaInputs: {
      values: getFormulaInput("values"),
      columns: getFormulaInput("columns"),
      rows: getFormulaInput("rows"),
    },
  };
}
