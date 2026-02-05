import { Box } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";

import { TimeFilterPicker } from "../TimeFilterPicker";
import type { FilterChangeOpts } from "../types";

interface FilterPickerBodyProps {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  source: LibMetric.SourceMetadata;
  filter?: LibMetric.FilterClause;
  onChange: (
    source: LibMetric.SourceMetadata,
    filter: LibMetric.FilterClause,
    opts: FilterChangeOpts,
  ) => void;
  onBack?: () => void;
}

export function FilterPickerBody({
  definition,
  dimension,
  source,
  filter,
  onChange,
  onBack,
}: FilterPickerBodyProps) {
  const FilterWidget = getFilterWidget(dimension);
  if (!FilterWidget) {
    return null;
  }

  return (
    <Box>
      <FilterWidget
        definition={definition}
        dimension={dimension}
        source={source}
        filter={filter}
        onChange={onChange}
        onBack={onBack}
      />
    </Box>
  );
}

function getFilterWidget(dimension: LibMetric.DimensionMetadata) {
  // TODO: add other filter pickers based on dimension type
  if (LibMetric.isTime(dimension)) {
    return TimeFilterPicker;
  }
  return null;
}
