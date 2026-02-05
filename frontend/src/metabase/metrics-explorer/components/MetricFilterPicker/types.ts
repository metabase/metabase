import type * as LibMetric from "metabase-lib/metric";

export type FilterOperatorOption<T extends LibMetric.FilterOperator> = {
  operator: T;
  displayName: string;
};

export type FilterPickerWidgetProps = {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  filter?: LibMetric.FilterClause;
  onChange: (filter: LibMetric.FilterClause, opts: FilterChangeOpts) => void;
  onBack?: () => void;
};

export type FilterChangeOpts = {
  run?: boolean;
};
