import * as Lib from "metabase-lib";
import { isCoordinate } from "metabase-lib";

import { BooleanFilterEditor } from "../BooleanFilterEditor";
import { CoordinateFilterEditor } from "../CoordinateFilterEditor";
import { DateFilterEditor } from "../DateFilterEditor";
import { DefaultFilterEditor } from "../DefaultFilterEditor";
import { NumberFilterEditor } from "../NumberFilterEditor";
import { StringFilterEditor } from "../StringFilterEditor";
import { TimeFilterEditor } from "../TimeFilterEditor";

interface ColumnFilterSectionProps {
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter: Lib.FilterClause | undefined;
  onChange: (filter: Lib.ExpressionClause | undefined) => void;
}

export function ColumnFilterSection({
  stageIndex,
  column,
  filter,
  onChange,
}: ColumnFilterSectionProps) {
  const FilterWidget = getFilterWidget(column);

  if (!FilterWidget) {
    return null;
  }

  return (
    <FilterWidget
      stageIndex={stageIndex}
      column={column}
      filter={filter}
      onChange={onChange}
    />
  );
}

function getFilterWidget(column: Lib.ColumnMetadata) {
  if (Lib.isBoolean(column)) {
    return BooleanFilterEditor;
  }
  if (Lib.isTime(column)) {
    return TimeFilterEditor;
  }
  if (Lib.isDateOrDateTime(column)) {
    return DateFilterEditor;
  }
  if (Lib.isNumeric(column)) {
    return isCoordinate(column) ? CoordinateFilterEditor : NumberFilterEditor;
  }
  if (Lib.isStringOrStringLike(column)) {
    return StringFilterEditor;
  }
  return DefaultFilterEditor;
}
