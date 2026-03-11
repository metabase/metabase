import type * as LibMetric from "metabase-lib/metric";

export type FilterSectionWidgetProps = {
  definition: LibMetric.MetricDefinition;
  filter: LibMetric.FilterClause;
  onRemove: () => void;
};
