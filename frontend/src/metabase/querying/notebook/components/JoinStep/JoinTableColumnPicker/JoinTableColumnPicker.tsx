import { useMemo } from "react";
import { t } from "ttag";

import { ColumnPickerSidebar } from "metabase/query_builder/components/ColumnPickerSidebar/ColumnPickerSidebar";
import * as Lib from "metabase-lib";

interface JoinTableColumnPickerProps {
  query: Lib.Query;
  stageIndex: number;
  join: Lib.Join;
  onChange: (newQuery: Lib.Query) => void;
  onClose: () => void;
}

export function JoinTableColumnPicker({
  query,
  stageIndex,
  join,
  onChange,
  onClose,
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
    <ColumnPickerSidebar
      isOpen
      onClose={onClose}
      query={query}
      stageIndex={stageIndex}
      columns={columns}
      title={t`Pick columns`}
      onToggle={handleToggle}
      onSelectAll={handleSelectAll}
      onSelectNone={handleSelectNone}
      data-testid="join-columns-picker-sidebar"
    />
  );
}
