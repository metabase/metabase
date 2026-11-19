import type * as Lib from "metabase-lib";

import type { SummaryQueryChangeOptions, SummaryWellId } from "../types";

/** A formula chip in a `Summarize by` or `Group by` well. */
export type SummaryFormula = {
  wellId: SummaryWellId;
  /** The chip's result column name. A rename changes it. */
  key: string;
  /** The formula without its name. It finds the chip again when its key changes. */
  signature: string;
  clause: Lib.AggregationClause | Lib.ExpressionClause;
  /** Position among the stage's aggregations, or its custom columns. */
  index: number;
  /** Position of the chip in its well. */
  position: number;
  /** Absent for an unnamed aggregation, which takes its name from the formula. */
  name?: string;
};

export type SummaryFormulaEdit = Pick<
  SummaryFormula,
  "wellId" | "key" | "signature" | "position"
>;

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
      formula: SummaryFormulaEdit;
      hasCustomName: boolean;
    }
);

export type SummaryFormulaInput = {
  start: (source: string, input: HTMLInputElement, onReady: () => void) => void;
  isPending: () => boolean;
  update: (source: string) => void;
  edit: (itemKey: string, input: HTMLInputElement | null) => void;
  /** Closes the bar when it holds this chip's formula. */
  cancelEdit: (itemKey: string) => void;
};
