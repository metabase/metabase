import type { ReactNode } from "react";

import type { FormulaSourceStatus } from "metabase/querying/components/FormulaEditor";
import type { ClickAction, ClickObject } from "metabase/visualizations/types";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export type ColumnFormulaChange = {
  isNewColumn: boolean;
};

export type ColumnFormulaBarOptions = {
  question: Question;
  readOnly?: boolean;
  isActive?: boolean;
  onQuestionChange: (question: Question, change: ColumnFormulaChange) => void;
  onEditSummaryFormula?: (expression: Lib.ExpressionClause) => void;
};

export type ColumnFormulaBar = {
  open: (() => void) | undefined;
  mapClickActions:
    | ((actions: ClickAction[], clicked: ClickObject) => ClickAction[])
    | undefined;
  bar: ReactNode;
};

export type ColumnFormulaDraft = { key: number } & (
  | { kind: "new" }
  | {
      kind: "edit";
      clause: Lib.ExpressionClause;
      source: string;
      sourceStatus: FormulaSourceStatus;
    }
);
