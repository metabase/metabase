import * as Lib from "metabase-lib";
import { BooleanFilterPicker } from "../BooleanFilterPicker";
import { CoordinateFilterPicker } from "../CoordinateFilterPicker";
import { DateFilterPicker } from "../DateFilterPicker";
import { NumberFilterPicker } from "../NumberFilterPicker";
import { StringFilterPicker } from "../StringFilterPicker";
import { TimeFilterPicker } from "../TimeFilterPicker";

interface FilterPickerBodyProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  isNew?: boolean;
  onChange: (filter: Lib.ExpressionClause) => void;
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

  if (FilterWidget) {
    return (
      <FilterWidget
        query={query}
        stageIndex={stageIndex}
        column={column}
        filter={filter}
        isNew={isNew}
        onChange={onChange}
        onBack={onBack}
      />
    );
  }

  return null;
}

function getFilterWidget(column: Lib.ColumnMetadata) {
  if (Lib.isBoolean(column)) {
    return BooleanFilterPicker;
  }
  if (Lib.isTime(column)) {
    return TimeFilterPicker;
  }
  if (Lib.isDate(column)) {
    return DateFilterPicker;
  }
  if (Lib.isCoordinate(column)) {
    return CoordinateFilterPicker;
  }
  if (Lib.isString(column)) {
    return StringFilterPicker;
  }
  if (Lib.isNumeric(column)) {
    return NumberFilterPicker;
  }
  return null;
}
