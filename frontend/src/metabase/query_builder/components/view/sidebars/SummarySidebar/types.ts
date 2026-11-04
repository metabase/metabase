import type * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

/** `values` is Summarize by, `columns` is Group by. */
export type SummaryWellId = "values" | "columns";

/** What a field in the list or a typeahead option stands for. */
export type SummaryField =
  | { kind: "count" }
  | { kind: "column"; column: Lib.ColumnMetadata }
  | { kind: "metric"; metric: Lib.MetricMetadata }
  | { kind: "measure"; measure: Lib.MeasureMetadata };

export type SummaryFieldItem = {
  key: string;
  name: string;
  icon: IconName;
  field: SummaryField;
};

export type SummaryFieldSection = {
  key: string;
  name: string;
  items: SummaryFieldItem[];
};

/** An aggregation in Summarize by, with what kind of chip shows it. */
export type SummaryValueItem = {
  clause: Lib.AggregationClause;
  label: string;
} & (
  | { kind: "count" }
  | { kind: "column"; column: Lib.ColumnMetadata }
  | { kind: "metric" }
  | { kind: "measure" }
  | { kind: "expression" }
);

/** A breakout in Group by. */
export type SummaryDimensionItem = {
  clause: Lib.BreakoutClause;
  label: string;
};

export type SummaryOperatorOption = {
  operator: Lib.AggregationOperator;
  shortName: string;
  displayName: string;
  /** Whether a column value is aggregated with this operator now. */
  isSelected: boolean;
};
