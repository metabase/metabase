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
