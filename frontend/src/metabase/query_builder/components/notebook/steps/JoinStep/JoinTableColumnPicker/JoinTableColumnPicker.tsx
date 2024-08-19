import { useMemo } from "react";

import {
  FieldPicker,
  type FieldPickerItem,
} from "metabase/common/components/FieldPicker";
import * as Lib from "metabase-lib";

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

  const handleSelectAll = () => {
    const newJoin = Lib.withJoinFields(join, "all");
    const newQuery = Lib.replaceClause(query, stageIndex, join, newJoin);
    onChange(newQuery);
  };

  const handleSelectNone = () => {
    const newJoin = Lib.withJoinFields(join, "none");
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
      onSelectAll={handleSelectAll}
      onSelectNone={handleSelectNone}
      data-testid="join-columns-picker"
    />
  );
}

function isColumnSelected({ columnInfo }: FieldPickerItem) {
  return Boolean(columnInfo.selected);
}
