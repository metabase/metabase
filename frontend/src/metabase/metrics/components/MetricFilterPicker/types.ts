import type * as Lib from "metabase-lib";
import type * as LibMetric from "metabase-lib/metric";

export type FilterOperatorOption<T extends Lib.FilterOperator> = {
  operator: T;
  displayName: string;
};

export type FilterPickerWidgetProps = {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  filter?: LibMetric.FilterClause;
  isNew?: boolean;
  readOnly?: boolean;
  onChange: (filter: LibMetric.FilterClause) => void;
  onBack?: () => void;
};
