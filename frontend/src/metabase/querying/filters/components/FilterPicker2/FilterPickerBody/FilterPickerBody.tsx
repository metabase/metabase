import * as Lib from "metabase-lib";

import { BooleanFilterPicker } from "../../FilterPicker/BooleanFilterPicker";
import { CoordinateFilterPicker } from "../../FilterPicker/CoordinateFilterPicker";
import { DateFilterPicker } from "../../FilterPicker/DateFilterPicker";
import { DefaultFilterPicker } from "../../FilterPicker/DefaultFilterPicker";
import { NumberFilterPicker } from "../../FilterPicker/NumberFilterPicker";
import { StringFilterPicker } from "../../FilterPicker/StringFilterPicker";
import { TimeFilterPicker } from "../../FilterPicker/TimeFilterPicker";

interface FilterPickerBodyProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  isNew?: boolean;
  onChange: (filter: Lib.ExpressionClause, stageIndex: number) => void;
  onBack?: () => void;
}

export function FilterPickerBody({
  query,
  stageIndex,
  column,
  filter,
  isNew = filter == null,
  onChange,
  onBack,
}: FilterPickerBodyProps) {
  const FilterWidget = getFilterWidget(column);
  if (!FilterWidget) {
    return null;
  }

  return (
    <FilterWidget
      query={query}
      stageIndex={stageIndex}
      column={column}
      filter={filter}
      isNew={isNew}
      onChange={filter => onChange(filter, stageIndex)}
      onBack={onBack}
    />
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
