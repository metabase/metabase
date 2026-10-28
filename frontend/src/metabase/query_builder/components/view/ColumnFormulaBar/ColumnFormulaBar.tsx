import { type ReactNode, useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { FormulaBarFrame, useFormulaBarSlot } from "../FormulaBar";
import { SummaryFormulaEditor } from "../SummarySidebar/SummaryFormulaEditor";
import type { SummaryBase, SummaryExpression } from "../SummarySidebar/types";

type ColumnFormulaBarOptions = {
  question: Question;
  onQuestionChange: (question: Question) => void;
};

type ColumnFormulaBar = {
  /** Opens the bar on an empty formula. */
  open: () => void;
  /** The bar, portaled into the formula bar slot; render it anywhere. */
  bar: ReactNode;
};

/**
 * Adds custom columns from the formula bar, the same one the summary sidebar edits formulas in,
 * e.g. from the results table's add-column button. Enter adds the column, named after its formula,
 * and hands over the updated question; Esc or ✕ closes the bar.
 */
export function useColumnFormulaBar({
  question,
  onQuestionChange,
}: ColumnFormulaBarOptions): ColumnFormulaBar {
  const formulaBarSlot = useFormulaBarSlot();
  // a fresh editor per open, so reopening never shows the last draft
  const [editorKey, setEditorKey] = useState<number | null>(null);
  const open = useCallback(() => setEditorKey(Date.now()), []);
  const close = () => setEditorKey(null);

  // a summarized query gets a new stage, so the column computes from the results the table shows
  const base: SummaryBase = useMemo(
    () => ({ query: Lib.ensureFilterStage(question.query()), stageIndex: -1 }),
    [question],
  );
  const databaseId = Lib.databaseID(base.query);
  const { data: database } = useGetDatabaseQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );

  const handleSubmit = ({ name, clause }: SummaryExpression) => {
    const nextQuery = Lib.expression(base.query, base.stageIndex, name, clause);
    onQuestionChange(question.setQuery(nextQuery));
    close();
  };

  const bar =
    formulaBarSlot &&
    createPortal(
      <FormulaBarFrame>
        {editorKey != null ? (
          <SummaryFormulaEditor
            key={editorKey}
            base={base}
            database={database}
            expressionMode="expression"
            submitLabel={t`Add column`}
            onSubmit={handleSubmit}
            onCancel={close}
          />
        ) : null}
      </FormulaBarFrame>,
      formulaBarSlot,
    );

  return { open, bar };
}
