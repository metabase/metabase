import type * as Lib from "metabase-lib";

import {
  FieldPicker,
  type FieldPickerItem,
  getNextSelectedColumns,
} from "../../FieldPicker";

interface JoinTableColumnPickerDraftProps {
  query: Lib.Query;
  stageIndex: number;
  columns: Lib.ColumnMetadata[];
  selectedColumns: Lib.ColumnMetadata[];
  onChange: (newSelectedColumns: Lib.ColumnMetadata[]) => void;
}

export function JoinTableColumnDraftPicker({
  query,
  stageIndex,
  columns,
  selectedColumns,
  onChange,
}: JoinTableColumnPickerDraftProps) {
  const isColumnSelected = ({ column }: FieldPickerItem) => {
    return selectedColumns.includes(column);
  };

  const handleToggle = (column: Lib.ColumnMetadata, isSelected: boolean) => {
    const newSelectedColumns = [...selectedColumns];
    if (isSelected) {
      newSelectedColumns.push(column);
    } else {
      const columnIndex = selectedColumns.indexOf(column);
      newSelectedColumns.splice(columnIndex, 1);
    }
    onChange(newSelectedColumns);
  };

  const handleToggleColumns = (
    targetColumns: Lib.ColumnMetadata[],
    isSelected: boolean,
  ) => {
    onChange(
      getNextSelectedColumns({
        columns,
        selectedColumns,
        targetColumns,
        isSelected,
      }),
    );
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
