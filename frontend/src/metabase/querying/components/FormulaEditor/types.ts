import type { EditorView } from "@codemirror/view";

import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

/** A custom column of a stage, with its position among the stage's custom columns. */
export type StageExpression = {
  clause: Lib.ExpressionClause;
  index: number;
};

export type NamedExpression = {
  name: string;
  clause: Lib.ExpressionClause;
  /** The formula as typed in the editor. */
  source: string;
};

export type FormulaSourceStatus = "loading" | "ready" | "failed";

export type FormulaEditorProps = {
  query: Lib.Query;
  stageIndex: number;
  database: Database | undefined;
  expressionMode: Lib.ExpressionMode;
  /** Position of the edited clause, so the formula cannot refer to itself. */
  expressionIndex?: number;
  initialSource?: string;
  /** Represents the formula loading status in the editor */
  sourceStatus?: FormulaSourceStatus;
  submitLabel: string;
  onEditorCreate?: (view: EditorView) => void;
  onNameChange?: (name: string, source: string) => void;
  onSubmit: (expression: NamedExpression) => void;
  onCancel: () => void;
};
