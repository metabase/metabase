import { useMemo } from "react";

import * as Lib from "metabase-lib";

import {
  FieldPicker,
  type FieldPickerItem,
  getNextSelectedColumns,
} from "../../FieldPicker";

interface JoinTableColumnPickerProps {
  query: Lib.Query;
  stageIndex: number;
  join: Lib.Join;
  onChange: (newQuery: Lib.Query) => void;
}

export function JoinTableColumnPicker({
  query,
  stageIndex,
  join,
  onChange,
}: JoinTableColumnPickerProps) {
  const columns = useMemo(
    () => Lib.joinableColumns(query, stageIndex, join),
    [query, stageIndex, join],
  );

  const handleToggle = (column: Lib.ColumnMetadata, isSelected: boolean) => {
    const newQuery = isSelected
      ? Lib.addField(query, stageIndex, column)
      : Lib.removeField(query, stageIndex, column);
    onChange(newQuery);
  };

  const handleToggleColumns = (
    targetColumns: Lib.ColumnMetadata[],
    isSelected: boolean,
  ) => {
    const selectedColumns = columns.filter(
      (column) => Lib.displayInfo(query, stageIndex, column).selected,
    );
    const nextColumns = getNextSelectedColumns({
      columns,
      selectedColumns,
      targetColumns,
      isSelected,
    });
    const newJoin = Lib.withJoinFields(
      join,
      getJoinFields(nextColumns, columns),
    );
    const newQuery = Lib.replaceClause(query, stageIndex, join, newJoin);
    onChange(newQuery);
  };

  return (
    <FieldPicker
      query={query}
      stageIndex={stageIndex}
      columns={columns}
      isColumnSelected={isColumnSelected}
      onToggle={handleToggle}
      onToggleColumns={handleToggleColumns}
      data-testid="join-columns-picker"
    />
  );
}

function isColumnSelected({ columnInfo }: FieldPickerItem) {
  return Boolean(columnInfo.selected);
}

function getJoinFields(
  selectedColumns: Lib.ColumnMetadata[],
  columns: Lib.ColumnMetadata[],
): Lib.JoinFields {
  if (selectedColumns.length === 0) {
    return "none";
  }
  if (selectedColumns.length === columns.length) {
    return "all";
  }
  return selectedColumns;
}
