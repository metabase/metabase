import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { hasFeature } from "metabase/databases";
import {
  type NamedExpression,
  isDefaultFormulaName,
} from "metabase/querying/components/FormulaEditor";
import { format } from "metabase/querying/expressions";
import * as Lib from "metabase-lib";

import { FormulaBarFrame, useFormulaBarSlot } from "../../../FormulaBar";
import type { DraftFormulaChipHandle } from "../SummaryWells/DraftFormulaChip";
import type { SummaryWellId } from "../types";

import { SummaryFormulaEditor } from "./SummaryFormulaEditor";
import type {
  SummaryFormulaBarOptions,
  SummaryFormulaClause,
  SummaryFormulaInput,
} from "./types";
import { useEditorSource } from "./use-editor-source";
import { useSummaryFormulaDraft } from "./use-summary-formula-draft";
import {
  addSummaryFormula,
  editSummaryFormula,
  findSummaryFormula,
} from "./utils";

export function useSummaryFormulaBar({
  query,
  stageIndex,
  onAdd,
  onEdit,
}: SummaryFormulaBarOptions) {
  const slot = useFormulaBarSlot();
  const draftChipRef = useRef<DraftFormulaChipHandle>(null);
  const editorSource = useEditorSource();
  const { draft, isActive, open, close, isCurrent, updateEditOriginal } =
    useSummaryFormulaDraft(editorSource.detach);
  const databaseId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    slot && databaseId != null ? { id: databaseId } : skipToken,
  );
  const editedFormula = useMemo(
    () =>
      draft?.kind === "edit"
        ? findSummaryFormula(query, stageIndex, draft.wellId, draft.clause)
        : null,
    [query, stageIndex, draft],
  );
  // The edited chip can go away under the bar, from its remove button or Clear all.
  const isEditedFormulaGone =
    isActive && draft?.kind === "edit" && !editedFormula;
  const openDraft = isActive && !isEditedFormulaGone ? draft : null;
  const openFormula = openDraft?.kind === "edit" ? editedFormula : null;

  useEffect(() => {
    if (isEditedFormulaGone) {
      close();
    }
  }, [isEditedFormulaGone, close]);

  const handleDraftNameChange = useCallback(
    (name: string, source: string) =>
      draftChipRef.current?.setFormula(name, source),
    [],
  );

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

  const editFormula = (
    wellId: SummaryWellId,
    clause: SummaryFormulaClause,
    input: HTMLInputElement | null,
  ) => {
    if (openFormula && Lib.isSameClause(openFormula.clause, clause)) {
      editorSource.focus();
      return;
    }
    const formula = findSummaryFormula(query, stageIndex, wellId, clause);
    if (!formula) {
      return;
    }
    const key = open(input, {
      kind: "edit",
      wellId,
      clause,
      source: "",
      original: { status: "loading" },
    });
    // the bar holds one line, so the printer must not wrap
    format(formula.clause, { query, stageIndex, printWidth: Infinity }).then(
      (source) => {
        // a formula opened since, new or edited, has taken the bar
        if (isCurrent(key)) {
          const { name } = formula;
          updateEditOriginal(key, {
            status: "ready",
            source,
            hasCustomName: name != null && !isDefaultFormulaName(name, source),
          });
          editorSource.showEditedSource(source);
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
        editorSource.startNew(wellId, source, onReady);
      },
      isPending: () => editorSource.isNewPending(wellId),
      update: (source) => editorSource.updateNew(wellId, source),
      edit: (clause, input) => editFormula(wellId, clause, input),
      cancelEdit: (clause) => {
        if (openFormula && Lib.isSameClause(openFormula.clause, clause)) {
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
          <SummaryFormulaEditor
            query={query}
            stageIndex={stageIndex}
            database={database}
            draft={openDraft}
            formula={openFormula}
            onEditorCreate={editorSource.handleEditorCreate}
            onNameChange={handleDraftNameChange}
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
            onFocus: editorSource.focus,
            onCancel: close,
          }
        : null,
    editingFormulaClause: openFormula?.clause,
    formulaInputs: {
      values: getFormulaInput("values"),
      columns: getFormulaInput("columns"),
    },
  };
}
