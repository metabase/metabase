import type * as LibMetric from "metabase-lib/metric";

export type FilterOperatorOption<T extends LibMetric.FilterOperator> = {
  operator: T;
  displayName: string;
};

export type FilterPickerWidgetProps = {
  autoFocus: boolean;
  definition: LibMetric.MetricDefinition;
  source: LibMetric.SourceMetadata;
  dimension: LibMetric.DimensionMetadata;
  filter?: LibMetric.FilterClause;
  isNew: boolean;
  withAddButton: boolean;
  withSubmitButton: boolean;
  onChange: (filter: LibMetric.FilterClause, opts: FilterChangeOpts) => void;
  onBack?: () => void;
  readOnly?: boolean;
};

export type FilterChangeOpts = {
  run?: boolean;
};
