import type * as Lib from "metabase-lib";

import type { SummaryQueryChangeOptions, SummaryWellId } from "../types";

/**
 * The formula behind a well's chip. An unnamed one takes its name from the edited source.
 * Chip keys are result column names, which a rename changes or another clause takes over,
 * so the name-independent signature tells the clauses apart.
 */
export type SummaryFormula = {
  wellId: SummaryWellId;
  key: string;
  signature: string;
  clause: Lib.AggregationClause | Lib.ExpressionClause;
  /** Position among the stage's aggregations, or its custom columns. */
  index: number;
  /** Position of the chip in its well. */
  position: number;
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
      /** The formula's name when it was generated from its source, once that is printed. */
      generatedName?: string;
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
