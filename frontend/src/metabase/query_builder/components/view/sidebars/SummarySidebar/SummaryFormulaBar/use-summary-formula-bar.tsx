import type { EditorView } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { hasFeature } from "metabase/databases";
import {
  FormulaEditor,
  type NamedExpression,
} from "metabase/querying/components/FormulaEditor";
import * as Lib from "metabase-lib";

import {
  FormulaBarFrame,
  useFormulaBarOwnership,
  useFormulaBarSlot,
} from "../../../FormulaBar";
import type { SummaryWellId } from "../types";

import type { SummaryFormulaInput } from "./types";
import { addSummaryFormula } from "./utils";

type Options = {
  query: Lib.Query;
  stageIndex: number;
  onAdd: (query: Lib.Query, wellId: SummaryWellId) => void;
};

type Draft = { key: number; wellId: SummaryWellId; source: string };

export function useSummaryFormulaBar({ query, stageIndex, onAdd }: Options) {
  const slot = useFormulaBarSlot();
  const ownership = useFormulaBarOwnership();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftName, setDraftName] = useState("");
  const viewRef = useRef<EditorView | null>(null);
  const nextKey = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingInput = useRef<{
    wellId: SummaryWellId;
    source: string;
    onReady: () => void;
  } | null>(null);
  const databaseId = Lib.databaseID(query);
  const { data: database } = useGetDatabaseQuery(
    slot && databaseId != null ? { id: databaseId } : skipToken,
  );

  useEffect(() => {
    if (!ownership.isActive) {
      setDraft(null);
      viewRef.current = null;
      pendingInput.current?.onReady();
      pendingInput.current = null;
    }
  }, [ownership.isActive]);

  const close = () => {
    viewRef.current = null;
    pendingInput.current?.onReady();
    pendingInput.current = null;
    setDraft(null);
    ownership.close();
    if (inputRef.current?.isConnected) {
      inputRef.current.focus();
    }
  };

  const handleSubmit = (expression: NamedExpression) => {
    if (draft) {
      onAdd(
        addSummaryFormula(query, stageIndex, draft.wellId, expression),
        draft.wellId,
      );
      close();
    }
  };

  const handleEditorCreate = (view: EditorView) => {
    viewRef.current = view;
    const pending = pendingInput.current;
    pendingInput.current = null;
    if (pending) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: pending.source },
        selection: { anchor: pending.source.length },
        userEvent: "input.type",
      });
      pending.onReady();
    }
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
        pendingInput.current = { wellId, source, onReady };
        inputRef.current = input;
        nextKey.current += 1;
        setDraftName("");
        setDraft({ key: nextKey.current, wellId, source });
        ownership.open();
      },
      isPending: () => pendingInput.current?.wellId === wellId,
      update: (source) => {
        if (pendingInput.current?.wellId === wellId) {
          pendingInput.current.source = source;
        }
      },
    };
  };

  const bar =
    slot &&
    createPortal(
      <FormulaBarFrame>
        {ownership.isActive && draft ? (
          <FormulaEditor
            key={draft.key}
            query={query}
            stageIndex={stageIndex}
            database={database}
            expressionMode={
              draft.wellId === "values" ? "aggregation" : "expression"
            }
            initialSource={draft.source}
            submitLabel={t`Add`}
            onEditorCreate={handleEditorCreate}
            onNameChange={setDraftName}
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
      ownership.isActive && draft
        ? {
            wellId: draft.wellId,
            name: draftName,
            onFocus: () => viewRef.current?.focus(),
            onCancel: close,
          }
        : null,
    formulaInputs: {
      values: getFormulaInput("values"),
      columns: getFormulaInput("columns"),
    },
  };
}
