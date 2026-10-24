import type * as Lib from "metabase-lib";

export const SUMMARY_WELL_IDS = ["rows", "columns", "values"] as const;

export type SummaryWellId = (typeof SUMMARY_WELL_IDS)[number];

export type SummaryDimensionWellId = Exclude<SummaryWellId, "values">;

/** A custom expression written in a well's formula input, with the name its result column gets. */
export type SummaryExpression = {
  name: string;
  clause: Lib.ExpressionClause;
};

/** A grouping: an existing column, or a custom column computed by an expression. */
export type SummaryDimension =
  | { id: string; column: Lib.ColumnMetadata }
  | { id: string; expression: SummaryExpression };

export type SummaryValue =
  | { id: string; type: "count" }
  | {
      id: string;
      type: "column";
      column: Lib.ColumnMetadata;
      operatorShortName: string;
    }
  | { id: string; type: "metric"; metric: Lib.MetricMetadata }
  | { id: string; type: "expression"; expression: SummaryExpression };

export type SummaryDefinition = {
  rows: SummaryDimension[];
  columns: SummaryDimension[];
  values: SummaryValue[];
  /** Shown as a pivot table, with groupings split into Rows and Columns, rather than grouped in one list. */
  isPivot: boolean;
};

/** The query a summary is built on top of: the summarized question's query, minus raw-row presentation clauses. */
export type SummaryBase = {
  query: Lib.Query;
  stageIndex: number;
};

export type SummaryDragItem =
  | { kind: "column"; column: Lib.ColumnMetadata; label: string }
  | { kind: "metric"; metric: Lib.MetricMetadata; label: string }
  | { kind: "chip"; wellId: SummaryWellId; itemId: string; label: string };

/**
 * Prototype-only: the summary layouts being compared. `a` lays the wells out like a pivot table,
 * `b` reads as a sentence, and `c` starts from the columns and adds spreadsheet-style helper columns.
 */
export const SUMMARY_VARIANTS = ["a", "b", "c"] as const;

export type SummaryVariant = (typeof SUMMARY_VARIANTS)[number];

export const SUMMARY_VALUE_FORMATS = ["number", "currency", "percent"] as const;

/** How a value's numbers are shown; `number` leaves the column's own formatting alone. */
export type SummaryValueFormat = (typeof SUMMARY_VALUE_FORMATS)[number];

/** The formats picked for values, keyed by value id; values without one keep their own formatting. */
export type SummaryValueFormats = Partial<Record<string, SummaryValueFormat>>;
