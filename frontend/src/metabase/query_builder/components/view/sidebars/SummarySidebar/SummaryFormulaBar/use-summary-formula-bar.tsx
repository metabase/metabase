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
  SummaryFormulaOriginal,
} from "./types";
import {
  addSummaryFormula,
  editSummaryFormula,
  findSummaryFormula,
} from "./utils";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

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
  const draftChipRef = useRef<DraftFormulaChipHandle>(null);
  const viewRef = useRef<EditorView | null>(null);
  const nextKey = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingSource = useRef<PendingSource | null>(null);
  const databaseId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    slot && databaseId != null ? { id: databaseId } : skipToken,
  );
  const editedFormula = useMemo(
    () =>
      draft?.kind === "edit"
        ? findSummaryFormula(query, stageIndex, draft.wellId, draft.uuid)
        : null,
    [query, stageIndex, draft],
  );
  // The edited chip can go away under the bar, from its remove button or Clear all.
  const isEditedFormulaGone =
    ownership.isActive && draft?.kind === "edit" && !editedFormula;
  const openDraft = ownership.isActive && !isEditedFormulaGone ? draft : null;
  const openFormula = openDraft?.kind === "edit" ? editedFormula : null;

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

  const reset = useCallback(() => {
    nextKey.current += 1;
    viewRef.current = null;
    dropPendingSource();
    setDraft(null);
  }, [dropPendingSource]);

  const updateEditOriginal = (key: number, original: SummaryFormulaOriginal) =>
    setDraft((draft) =>
      draft?.kind === "edit" && draft.key === key
        ? { ...draft, original }
        : draft,
    );

  useEffect(() => {
    if (!ownership.isActive) {
      reset();
    }
  }, [ownership.isActive, reset]);

  const releaseOwnership = ownership.close;
  const close = useCallback(() => {
    reset();
    releaseOwnership();
    if (inputRef.current?.isConnected) {
      inputRef.current.focus();
    }
  }, [reset, releaseOwnership]);

  /** Opens the bar with a new draft, and returns the draft's key. */
  const open = (
    input: HTMLInputElement | null,
    nextDraft: DistributiveOmit<SummaryFormulaDraft, "key">,
  ) => {
    reset();
    inputRef.current = input;
    const key = nextKey.current;
    setDraft({ ...nextDraft, key });
    ownership.open();
    return key;
  };

  useEffect(() => {
    if (isEditedFormulaGone) {
      close();
    }
  }, [isEditedFormulaGone, close]);

  const handleSubmit = (expression: NamedExpression) => {
    if (openDraft?.kind === "new") {
      onAdd(
        addSummaryFormula(query, stageIndex, openDraft.wellId, expression),
        openDraft.wellId,
      );
    } else if (
      openDraft?.kind === "edit" &&
      openDraft.original.status === "ready" &&
      openFormula
    ) {
      // Replacing an unchanged formula still rewrites the clauses that refer to it, so skip it.
      const { original } = openDraft;
      if (expression.source !== original.source) {
        const result = editSummaryFormula(
          query,
          stageIndex,
          openFormula,
          expression,
          original.hasCustomName,
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
    updateEditOriginal(key, {
      status: "ready",
      source,
      hasCustomName: name != null && !isDefaultFormulaName(name, source),
    });
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
    if (openFormula?.uuid === uuid) {
      viewRef.current?.focus();
      return;
    }
    const formula = findSummaryFormula(query, stageIndex, wellId, uuid);
    if (!formula) {
      return;
    }
    const key = open(input, {
      kind: "edit",
      wellId,
      uuid,
      source: "",
      original: { status: "loading" },
    });
    // the bar holds one line, so the printer must not wrap
    format(formula.clause, { query, stageIndex, printWidth: Infinity }).then(
      (source) => {
        // a formula opened since, new or edited, has taken the bar
        if (nextKey.current === key) {
          showEditedSource(key, source, formula.name);
        }
      },
      () => updateEditOriginal(key, { status: "failed" }),
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
        open(input, { kind: "new", wellId, source });
        pendingSource.current = { kind: "new", wellId, source, onReady };
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
        if (openFormula?.uuid === Lib.clauseUuid(clause)) {
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
            expressionIndex={openFormula?.index}
            initialSource={openDraft.source}
            sourceStatus={
              openDraft.kind === "edit" ? openDraft.original.status : undefined
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
    editingFormulaUuid: openFormula?.uuid,
    formulaInputs: {
      values: getFormulaInput("values"),
      columns: getFormulaInput("columns"),
    },
  };
}
