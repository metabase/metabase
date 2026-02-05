import cx from "classnames";

import { Box } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";

import { TimeFilterPicker } from "../TimeFilterPicker";
import type { FilterChangeOpts } from "../types";

import S from "./FilterPickerBody.module.css";

interface FilterPickerBodyProps {
  autoFocus?: boolean;
  definition: LibMetric.MetricDefinition;
  source: LibMetric.SourceMetadata;
  dimension: LibMetric.DimensionMetadata;
  filter?: LibMetric.FilterClause;
  isNew?: boolean;
  withAddButton?: boolean;
  withSubmitButton?: boolean;
  onChange: (filter: LibMetric.FilterClause, opts: FilterChangeOpts) => void;
  onBack?: () => void;
  readOnly?: boolean;
}

export function FilterPickerBody({
  autoFocus = true,
  definition,
  source,
  dimension,
  filter,
  isNew = filter == null,
  withAddButton = false,
  withSubmitButton = true,
  onChange,
  onBack,
  readOnly,
}: FilterPickerBodyProps) {
  const FilterWidget = getFilterWidget(dimension);
  if (!FilterWidget) {
    return null;
  }

  return (
    <Box className={cx({ [S.readOnly]: readOnly })}>
      <FilterWidget
        autoFocus={autoFocus}
        definition={definition}
        source={source}
        dimension={dimension}
        filter={filter}
        isNew={isNew}
        withAddButton={withAddButton}
        withSubmitButton={withSubmitButton && !readOnly}
        onChange={onChange}
        onBack={onBack}
        readOnly={readOnly}
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
