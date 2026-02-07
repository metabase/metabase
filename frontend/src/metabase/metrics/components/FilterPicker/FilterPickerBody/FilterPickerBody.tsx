import { Box } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";

import { BooleanFilterPicker } from "../BooleanFilterPicker";
import { CoordinateFilterPicker } from "../CoordinateFilterPicker";
import { DateFilterPicker } from "../DateFilterPicker";
import { DefaultFilterPicker } from "../DefaultFilterPicker";
import { NumberFilterPicker } from "../NumberFilterPicker";
import { StringFilterPicker } from "../StringFilterPicker";
import { TimeFilterPicker } from "../TimeFilterPicker";

interface FilterPickerBodyProps {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
  filter?: LibMetric.FilterClause;
  isNew?: boolean;
  readOnly?: boolean;
  onSelect: (filter: LibMetric.FilterClause) => void;
  onBack?: () => void;
}

export function FilterPickerBody({
  definition,
  dimension,
  filter,
  isNew,
  readOnly,
  onSelect,
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
        onSelect={onSelect}
        onBack={onBack}
      />
    </Box>
  );
}

function getFilterWidget(dimension: LibMetric.DimensionMetadata) {
  if (LibMetric.isBoolean(dimension)) {
    return BooleanFilterPicker;
  }
  if (LibMetric.isTime(dimension)) {
    return TimeFilterPicker;
  }
  if (LibMetric.isDateOrDateTime(dimension)) {
    return DateFilterPicker;
  }
  if (LibMetric.isNumeric(dimension)) {
    return LibMetric.isCoordinate(dimension)
      ? CoordinateFilterPicker
      : NumberFilterPicker;
  }
  if (LibMetric.isStringOrStringLike(dimension)) {
    return StringFilterPicker;
  }
  return DefaultFilterPicker;
}
