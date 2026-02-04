import cx from "classnames";

import { BooleanFilterPicker } from "metabase/querying/filters/components/FilterPicker/BooleanFilterPicker";
import { CoordinateFilterPicker } from "metabase/querying/filters/components/FilterPicker/CoordinateFilterPicker";
import { DateFilterPicker } from "metabase/querying/filters/components/FilterPicker/DateFilterPicker";
import { DefaultFilterPicker } from "metabase/querying/filters/components/FilterPicker/DefaultFilterPicker";
import { NumberFilterPicker } from "metabase/querying/filters/components/FilterPicker/NumberFilterPicker";
import { StringFilterPicker } from "metabase/querying/filters/components/FilterPicker/StringFilterPicker";
import { TimeFilterPicker } from "metabase/querying/filters/components/FilterPicker/TimeFilterPicker";
import type { FilterChangeOpts } from "metabase/querying/filters/components/FilterPicker/types";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./FilterPickerBody.module.css";

interface FilterPickerBodyProps {
  autoFocus?: boolean;
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.Filterable;
  isNew?: boolean;
  withAddButton?: boolean;
  withSubmitButton?: boolean;
  onChange: (filter: Lib.ExpressionClause, opts: FilterChangeOpts) => void;
  onBack?: () => void;
  readOnly?: boolean;
}

export function FilterPickerBody({
  autoFocus = true,
  query,
  stageIndex,
  column,
  filter,
  isNew = filter == null,
  withAddButton = false,
  withSubmitButton = true,
  onChange,
  onBack,
  readOnly,
}: FilterPickerBodyProps) {
  const FilterWidget = getFilterWidget(column);
  if (!FilterWidget) {
    return null;
  }

  return (
    <Box className={cx({ [S.readOnly]: readOnly })}>
      <FilterWidget
        autoFocus={autoFocus}
        query={query}
        stageIndex={stageIndex}
        column={column}
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

function getFilterWidget(column: Lib.ColumnMetadata) {
  if (Lib.isBoolean(column)) {
    return BooleanFilterPicker;
  }
  if (Lib.isTime(column)) {
    return TimeFilterPicker;
  }
  if (Lib.isDateOrDateTime(column)) {
    return DateFilterPicker;
  }
  if (Lib.isNumeric(column)) {
    return Lib.isCoordinate(column)
      ? CoordinateFilterPicker
      : NumberFilterPicker;
  }
  if (Lib.isStringOrStringLike(column)) {
    return StringFilterPicker;
  }
  return DefaultFilterPicker;
}
