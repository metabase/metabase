import {
  FieldPicker,
  type FieldPickerItem,
} from "metabase/common/components/FieldPicker";
import type * as Lib from "metabase-lib";

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

  const handleSelectAll = () => {
    onChange(columns);
  };

  const handleSelectNone = () => {
    onChange([]);
  };

  return (
    <FieldPicker
      query={query}
      stageIndex={stageIndex}
      columns={columns}
      isColumnSelected={isColumnSelected}
      onToggle={handleToggle}
      onSelectAll={handleSelectAll}
      onSelectNone={handleSelectNone}
      data-testid="join-columns-picker"
    />
  );
}
