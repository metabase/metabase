import type * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

/** `values` is Summarize by, `columns` is Group by. */
export type SummaryWellId = "values" | "columns";

export type SummaryQueryChangeOptions = {
  createdFormula?: boolean;
  renamedExpression?: { from: string; to: string };
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
} & (
  | { kind: "count" }
  | {
      kind: "column";
      column: Lib.ColumnMetadata;
      operatorOptions: SummaryOperatorOption[];
    }
  | { kind: "metric" }
  | { kind: "measure" }
  /** `column` is set when the formula aggregates a single column, so it can be dragged to Group by. */
  | { kind: "expression"; column?: Lib.ColumnMetadata }
);

export type SummaryDimensionItem = {
  clause: Lib.BreakoutClause;
  expression?: Lib.ExpressionClause;
  key: string;
  label: string;
};

export type SummaryDragItem =
  | { kind: "field"; field: SummaryField; label: string }
  | { kind: "value"; item: SummaryValueItem }
  | { kind: "dimension"; item: SummaryDimensionItem };
