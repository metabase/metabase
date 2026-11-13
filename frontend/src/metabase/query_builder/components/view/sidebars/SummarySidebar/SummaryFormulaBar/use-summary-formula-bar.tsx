import type { EditorView } from "@codemirror/view";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLatest } from "react-use";
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
import type { SummaryWellId } from "../types";

import type {
  SummaryFormulaBarOptions,
  SummaryFormulaDraft,
  SummaryFormulaInput,
} from "./types";
import {
  addSummaryFormula,
  editSummaryFormula,
  findEditedFormula,
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
  onAdd,
  onEdit,
}: SummaryFormulaBarOptions) {
  const slot = useFormulaBarSlot();
  const ownership = useFormulaBarOwnership();
  const [draft, setDraft] = useState<SummaryFormulaDraft | null>(null);
  const [draftName, setDraftName] = useState("");
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
        ? findEditedFormula(query, stageIndex, activeDraft.formula)
        : null,
    [query, stageIndex, activeDraft],
  );
  const openDraft =
    activeDraft?.kind === "new" || editedFormula ? activeDraft : null;

  const dropPendingSource = () => {
    const pending = pendingSource.current;
    pendingSource.current = null;
    if (pending?.kind === "new") {
      pending.onReady();
    }
  };
  const dropPendingSourceRef = useLatest(dropPendingSource);

  useEffect(() => {
    if (!ownership.isActive) {
      setDraft(null);
      viewRef.current = null;
      dropPendingSourceRef.current();
    }
  }, [ownership.isActive, dropPendingSourceRef]);

  const close = () => {
    viewRef.current = null;
    dropPendingSource();
    setDraft(null);
    ownership.close();
    if (inputRef.current?.isConnected) {
      inputRef.current.focus();
    }
  };

  // The edited chip can go away under the bar, from its remove button or Clear all.
  const isEditedFormulaGone = activeDraft?.kind === "edit" && !editedFormula;
  const closeRef = useLatest(close);
  useEffect(() => {
    if (isEditedFormulaGone) {
      closeRef.current();
    }
  }, [isEditedFormulaGone, closeRef]);

  const handleSubmit = (expression: NamedExpression) => {
    if (activeDraft?.kind === "new") {
      onAdd(
        addSummaryFormula(query, stageIndex, activeDraft.wellId, expression),
        activeDraft.wellId,
      );
    } else if (activeDraft?.kind === "edit" && editedFormula) {
      // a rename on the chip while the bar is open makes the name a given one
      const hasGeneratedName =
        editedFormula.name != null &&
        editedFormula.name === activeDraft.generatedName;
      const result = editSummaryFormula(
        query,
        stageIndex,
        editedFormula,
        expression,
        hasGeneratedName,
      );
      onEdit(result.query, result.options);
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
    if (name != null && isDefaultFormulaName(name, source)) {
      setDraft((draft) =>
        draft?.kind === "edit" && draft.key === key
          ? { ...draft, generatedName: name }
          : draft,
      );
    }
    const view = viewRef.current;
    if (view == null) {
      pendingSource.current = { kind: "edit", source };
    } else if (view.state.doc.length === 0) {
      showSource(view, source);
    }
  };

  const editFormula = (
    wellId: SummaryWellId,
    itemKey: string,
    input: HTMLInputElement | null,
  ) => {
    if (editedFormula?.wellId === wellId && editedFormula.key === itemKey) {
      viewRef.current?.focus();
      return;
    }
    const formula = findSummaryFormula(query, stageIndex, wellId, itemKey);
    if (!formula) {
      return;
    }
    viewRef.current = null;
    dropPendingSource();
    inputRef.current = input;
    nextKey.current += 1;
    const key = nextKey.current;
    setDraft({ kind: "edit", key, wellId, formula, source: "" });
    ownership.open();
    // the bar holds one line, so the printer must not wrap
    format(formula.clause, { query, stageIndex, printWidth: Infinity })
      .catch(() => null)
      .then((source) => {
        // a formula opened since, new or edited, has taken the bar
        if (source != null && nextKey.current === key) {
          showEditedSource(key, source, formula.name);
        }
      });
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
        setDraftName("");
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
      edit: (itemKey, input) => editFormula(wellId, itemKey, input),
      cancelEdit: (itemKey) => {
        if (editedFormula?.wellId === wellId && editedFormula.key === itemKey) {
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
            submitLabel={openDraft.kind === "edit" ? t`Update` : t`Add`}
            onEditorCreate={handleEditorCreate}
            onNameChange={openDraft.kind === "new" ? setDraftName : undefined}
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
            name: draftName,
            onFocus: () => viewRef.current?.focus(),
            onCancel: close,
          }
        : null,
    editedFormula,
    formulaInputs: {
      values: getFormulaInput("values"),
      columns: getFormulaInput("columns"),
    },
  };
}
