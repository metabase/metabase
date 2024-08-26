import * as Lib from "metabase-lib";

import { BooleanFilterEditor } from "../BooleanFilterEditor";
import { CoordinateFilterEditor } from "../CoordinateFilterEditor";
import { DateFilterEditor } from "../DateFilterEditor";
import { DefaultFilterEditor } from "../DefaultFilterEditor";
import { NumberFilterEditor } from "../NumberFilterEditor";
import { StringFilterEditor } from "../StringFilterEditor";
import { TimeFilterEditor } from "../TimeFilterEditor";

interface ColumnFilterSectionProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter: Lib.FilterClause | undefined;
  isSearching: boolean;
  onChange: (filter: Lib.ExpressionClause | undefined) => void;
  onInput: () => void;
}

export function ColumnFilterSection({
  query,
  stageIndex,
  column,
  filter,
  isSearching,
  onChange,
  onInput,
}: ColumnFilterSectionProps) {
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
      isSearching={isSearching}
      onChange={onChange}
      onInput={onInput}
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
  if (Lib.isTemporal(column)) {
    return DateFilterEditor;
  }
  if (Lib.isCoordinate(column)) {
    return CoordinateFilterEditor;
  }
  if (Lib.isNumeric(column)) {
    return NumberFilterEditor;
  }
  if (Lib.isStringOrStringLike(column)) {
    return StringFilterEditor;
  }
  return DefaultFilterEditor;
}
