import * as Lib from "metabase-lib";
import { BooleanFilterEditor } from "../BooleanFilterEditor";
import { NumberFilterEditor } from "../NumberFilterEditor";
import { TimeFilterEditor } from "../TimeFilterEditor";

interface ColumnFilterSectionProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  filter?: Lib.FilterClause;
  onChange: (filter?: Lib.ExpressionClause) => void;
}

export function ColumnFilterSection({
  query,
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
      query={query}
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
  if (Lib.isNumeric(column)) {
    return NumberFilterEditor;
  }
  return null;
}
