import type * as Lib from "metabase-lib";

import type {
  SummaryDimensionWellId,
  SummaryQueryChangeOptions,
  SummaryWellId,
} from "../types";

export type SummaryFormulaClause = Lib.AggregationClause | Lib.ExpressionClause;

/** The formula of a chip in a `Summarize by` or `Group by` well. */
export type SummaryFormula = {
  /** Position among the stage's aggregations, or its custom columns. */
  index: number;
  /** Absent for an unnamed aggregation, which takes its name from the formula. */
  name?: string;
} & (
  | { wellId: "values"; clause: Lib.AggregationClause }
  | {
      wellId: SummaryDimensionWellId;
      /** The custom column of one or more groupings. */
      clause: Lib.ExpressionClause;
    }
);

export type SummaryFormulaBarOptions = {
  query: Lib.Query;
  stageIndex: number;
  isPivotMode: boolean;
  onAdd: (query: Lib.Query, wellId: SummaryWellId) => void;
  onEdit: (query: Lib.Query, options: SummaryQueryChangeOptions) => void;
};

/** The formula an edit starts from. Its text and name are known once it has loaded. */
export type SummaryFormulaOriginal =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; source: string; hasCustomName: boolean };

export type SummaryFormulaDraft = {
  key: number;
  wellId: SummaryWellId;
  source: string;
} & (
  | { kind: "new" }
  | {
      kind: "edit";
      clause: SummaryFormulaClause;
      original: SummaryFormulaOriginal;
    }
);

export type SummaryFormulaInput = {
  start: (source: string, input: HTMLInputElement, onReady: () => void) => void;
  isPending: () => boolean;
  update: (source: string) => void;
  edit: (clause: SummaryFormulaClause, input: HTMLInputElement | null) => void;
  /** Closes the bar when it holds this formula. */
  cancelEdit: (clause: SummaryFormulaClause) => void;
};
