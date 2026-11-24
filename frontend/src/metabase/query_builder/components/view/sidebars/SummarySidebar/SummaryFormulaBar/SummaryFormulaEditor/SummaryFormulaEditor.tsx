import type { EditorView } from "@codemirror/view";
import { t } from "ttag";

import {
  FormulaEditor,
  type NamedExpression,
} from "metabase/querying/components/FormulaEditor";
import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import type { SummaryWellId } from "../../types";
import type { SummaryFormula, SummaryFormulaDraft } from "../types";

type SummaryFormulaEditorProps = {
  query: Lib.Query;
  stageIndex: number;
  database: Database | undefined;
  draft: SummaryFormulaDraft;
  formula: SummaryFormula | null;
  onEditorCreate: (view: EditorView) => void;
  onNameChange: (name: string, source: string) => void;
  onSubmit: (expression: NamedExpression) => void;
  onCancel: () => void;
};

function getExpressionMode(wellId: SummaryWellId): Lib.ExpressionMode {
  return wellId === "values" ? "aggregation" : "expression";
}

export function SummaryFormulaEditor({
  query,
  stageIndex,
  database,
  draft,
  formula,
  onEditorCreate,
  onNameChange,
  onSubmit,
  onCancel,
}: SummaryFormulaEditorProps) {
  const isEdit = draft.kind === "edit";
  return (
    <FormulaEditor
      key={draft.key}
      query={query}
      stageIndex={stageIndex}
      database={database}
      expressionMode={getExpressionMode(draft.wellId)}
      expressionIndex={formula?.index}
      initialSource={draft.source}
      initialName={isEdit ? undefined : draft.name}
      sourceStatus={isEdit ? draft.original.status : undefined}
      submitLabel={isEdit ? t`Update` : t`Add`}
      onEditorCreate={onEditorCreate}
      onNameChange={isEdit ? undefined : onNameChange}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
}
