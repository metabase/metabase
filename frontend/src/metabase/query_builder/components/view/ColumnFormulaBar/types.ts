import type { ReactNode } from "react";

import type { FormulaSourceStatus } from "metabase/querying/components/FormulaEditor";
import type { ClickAction, ClickObject } from "metabase/visualizations/types";
import type * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export type ColumnFormulaChange = {
  /** False when the formula of an existing custom column changed. */
  isNewColumn: boolean;
};

export type ColumnFormulaBarOptions = {
  question: Question;
  readOnly?: boolean;
  isActive?: boolean;
  onQuestionChange: (question: Question, change: ColumnFormulaChange) => void;
  /** Opens a Group by formula of the summary, by its custom column. */
  onEditSummaryFormula?: (expression: Lib.ExpressionClause) => void;
};

export type ColumnFormulaBar = {
  /** Opens an empty formula, or focuses the current draft. */
  open: (() => void) | undefined;
  /** Puts "Edit formula" in place of "Combine columns" in the header actions of a custom column or a Group by formula. */
  mapClickActions:
    | ((actions: ClickAction[], clicked: ClickObject) => ClickAction[])
    | undefined;
  bar: ReactNode;
};

export type ColumnFormulaDraft = { key: number } & (
  | { kind: "new" }
  | {
      kind: "edit";
      /** The edited custom column. It finds the column again after the query changes. */
      clause: Lib.ExpressionClause;
      /** The printed formula, once it has loaded. The editor opens with it. */
      source: string;
      sourceStatus: FormulaSourceStatus;
    }
);

export type ColumnExpression = {
  clause: Lib.ExpressionClause;
  /** Position among the stage's custom columns. */
  index: number;
};
