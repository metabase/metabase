import type * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

/** `values` is Summarize by, `columns` is Group by. */
export type SummaryWellId = "values" | "columns";

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

export type SummaryOperatorOption = {
  operator: Lib.AggregationOperator;
  shortName: string;
  displayName: string;
  isSelected: boolean;
};

export type SummaryValueItem = {
  clause: Lib.AggregationClause;
  /** The name of the aggregation's result column, unique within the stage. */
  key: string;
  label: string;
} & (
  | { kind: "count" }
  | {
      kind: "column";
      column: Lib.ColumnMetadata;
      operatorOptions: SummaryOperatorOption[];
    }
  | { kind: "metric" }
  | { kind: "measure" }
  | { kind: "expression" }
);

export type SummaryDimensionItem = {
  clause: Lib.BreakoutClause;
  /** The name of the breakout's result column, unique within the stage. */
  key: string;
  label: string;
};
