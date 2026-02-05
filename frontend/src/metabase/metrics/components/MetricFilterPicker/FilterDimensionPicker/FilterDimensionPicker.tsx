import type * as LibMetric from "metabase-lib/metric";

type FilterDimensionPickerProps = {
  definitions: LibMetric.MetricDefinition[];
  onChange: (
    definition: LibMetric.MetricDefinition,
    dimension: LibMetric.DimensionMetadata,
  ) => void;
  onBack?: () => void;
};

export function FilterDimensionPicker(_props: FilterDimensionPickerProps) {
  return null;
}
