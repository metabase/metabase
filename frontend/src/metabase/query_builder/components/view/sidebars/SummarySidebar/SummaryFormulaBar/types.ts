import type * as Lib from "metabase-lib";

import type { SummaryQueryChangeOptions, SummaryWellId } from "../types";

export type SummaryFormulaClause = Lib.AggregationClause | Lib.ExpressionClause;

/** The formula of a chip in a `Summarize by` or `Group by` well. */
export type SummaryFormula = {
  wellId: SummaryWellId;
  /** An aggregation, or the custom column of one or more groupings. */
  clause: SummaryFormulaClause;
  /** The clause's UUID. It finds the formula again after the query changes. */
  uuid: string;
  /** Position among the stage's aggregations, or its custom columns. */
  index: number;
  /** Absent for an unnamed aggregation, which takes its name from the formula. */
  name?: string;
};

export type SummaryFormulaBarOptions = {
  query: Lib.Query;
  stageIndex: number;
  onAdd: (query: Lib.Query, wellId: SummaryWellId) => void;
  onEdit: (query: Lib.Query, options: SummaryQueryChangeOptions) => void;
};

export type SummaryFormulaDraft = {
  key: number;
  wellId: SummaryWellId;
  source: string;
} & (
  | { kind: "new" }
  | {
      kind: "edit";
      uuid: string;
      hasCustomName: boolean;
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
