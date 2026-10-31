import type * as Lib from "metabase-lib";

export const SUMMARY_WELL_IDS = ["rows", "columns", "values"] as const;

export type SummaryWellId = (typeof SUMMARY_WELL_IDS)[number];

export type SummaryDimensionWellId = Exclude<SummaryWellId, "values">;

export type SummaryDimension = {
  id: string;
  column: Lib.ColumnMetadata;
};

export type SummaryValue =
  | { id: string; type: "count" }
  | {
      id: string;
      type: "column";
      column: Lib.ColumnMetadata;
      operatorShortName: string;
    }
  | { id: string; type: "metric"; metric: Lib.MetricMetadata };

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
