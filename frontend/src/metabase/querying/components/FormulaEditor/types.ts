import type { EditorView } from "@codemirror/view";

import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

export type NamedExpression = {
  name: string;
  clause: Lib.ExpressionClause;
};

export type FormulaEditorProps = {
  query: Lib.Query;
  stageIndex: number;
  database: Database | undefined;
  expressionMode: Lib.ExpressionMode;
  initialClause?: Lib.Expressionable | null;
  initialSource?: string;
  initialName?: string;
  submitLabel: string;
  onEditorCreate?: (view: EditorView) => void;
  onNameChange?: (name: string) => void;
  onSubmit: (expression: NamedExpression) => void;
  onCancel: () => void;
  onNavigate?: (
    direction: "backward" | "forward",
    expression: NamedExpression | null,
  ) => boolean;
};
