import type * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

/** `values` is Summarize by, `columns` is Group by. */
export type SummaryWellId = "values" | "columns";

export type SummaryQueryChangeOptions = {
  createdFormula?: boolean;
  renamedFormula?: { name: string; nextName: string };
  /** The name of an owned grouping formula whose definition changed. */
  editedFormula?: string;
};

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
  key: string;
  label: string;
  isNamed: boolean;
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

export type SummaryBucketOption = {
  displayName: string;
  isSelected: boolean;
  column: Lib.ColumnMetadata;
};

export type SummaryDimensionItem = {
  clause: Lib.BreakoutClause;
  expression?: Lib.ExpressionClause;
  key: string;
  label: string;
  bucketOptions: SummaryBucketOption[];
  initialBucketOptionCount: number;
};

export type SummaryDragItem =
  | { kind: "field"; field: SummaryField; label: string }
  | { kind: "value"; item: SummaryValueItem }
  | { kind: "dimension"; item: SummaryDimensionItem };
