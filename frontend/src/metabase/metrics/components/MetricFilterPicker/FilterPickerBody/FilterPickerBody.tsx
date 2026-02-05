import { Box } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";

import { TimeFilterPicker } from "../TimeFilterPicker";

interface FilterPickerBodyProps {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  filter?: LibMetric.FilterClause;
  isNew?: boolean;
  readOnly?: boolean;
  onChange: (filter: LibMetric.FilterClause) => void;
  onBack?: () => void;
}

export function FilterPickerBody({
  definition,
  dimension,
  filter,
  isNew,
  readOnly,
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
        filter={filter}
        isNew={isNew}
        readOnly={readOnly}
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
