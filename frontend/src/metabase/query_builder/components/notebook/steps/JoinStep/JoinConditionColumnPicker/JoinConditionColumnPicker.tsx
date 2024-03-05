import type { Ref } from "react";
import { forwardRef, useMemo } from "react";
import { t } from "ttag";

import type { ColumnListItem } from "metabase/common/components/QueryColumnPicker";
import { Popover, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import {
  JoinCellItem,
  JoinColumnPicker,
} from "./JoinConditionColumnPicker.styled";

interface JoinConditionColumnPickerProps {
  query: Lib.Query;
  stageIndex: number;
  joinable: Lib.Join | Lib.Joinable;
  lhsColumn: Lib.ColumnMetadata | undefined;
  rhsColumn: Lib.ColumnMetadata | undefined;
  isOpened: boolean;
  isLhsColumn: boolean;
  isReadOnly: boolean;
  onChange: (column: Lib.ColumnMetadata) => void;
  onOpenChange: (isOpened: boolean) => void;
}

export function JoinConditionColumnPicker({
  query,
  stageIndex,
  joinable,
  lhsColumn,
  rhsColumn,
  isOpened,
  isLhsColumn,
  isReadOnly,
  onChange,
  onOpenChange,
}: JoinConditionColumnPickerProps) {
  return (
    <Popover opened={isOpened} position="bottom-start" onChange={onOpenChange}>
      <Popover.Target>
        <JoinColumnTarget
          query={query}
          stageIndex={stageIndex}
          lhsColumn={lhsColumn}
          rhsColumn={rhsColumn}
          isLhsColumn={isLhsColumn}
          isOpened={isOpened}
          isReadOnly={isReadOnly}
          onClick={() => onOpenChange(!isOpened)}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <JoinColumnDropdown
          query={query}
          stageIndex={stageIndex}
          joinable={joinable}
          lhsColumn={lhsColumn}
          rhsColumn={rhsColumn}
          isLhsColumn={isLhsColumn}
          onChange={onChange}
          onClose={() => onOpenChange(false)}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

interface JoinColumnTargetProps {
  query: Lib.Query;
  stageIndex: number;
  lhsColumn: Lib.ColumnMetadata | undefined;
  rhsColumn: Lib.ColumnMetadata | undefined;
  isLhsColumn: boolean;
  isOpened: boolean;
  isReadOnly: boolean;
  onClick: () => void;
}

const JoinColumnTarget = forwardRef(function JoinColumnTarget(
  {
    query,
    stageIndex,
    lhsColumn,
    rhsColumn,
    isLhsColumn,
    isOpened,
    isReadOnly,
    onClick,
  }: JoinColumnTargetProps,
  ref: Ref<HTMLButtonElement>,
) {
  const column = isLhsColumn ? lhsColumn : rhsColumn;
  const columnInfo = useMemo(
    () => (column ? Lib.displayInfo(query, stageIndex, column) : undefined),
    [query, stageIndex, column],
  );

  return (
    <JoinCellItem
      ref={ref}
      isOpen={isOpened}
      isColumnSelected={column != null}
      isReadOnly={isReadOnly}
      disabled={isReadOnly}
      onClick={onClick}
      aria-label={isLhsColumn ? t`Left column` : t`Right column`}
    >
      <Text
        display="block"
        color={columnInfo ? "white" : "brand"}
        align="left"
        weight={700}
        lh={1}
      >
        {columnInfo?.displayName || t`Pick a column…`}
      </Text>
    </JoinCellItem>
  );
});

interface JoinColumnDropdownProps {
  query: Lib.Query;
  stageIndex: number;
  joinable: Lib.Join | Lib.Joinable;
  lhsColumn: Lib.ColumnMetadata | undefined;
  rhsColumn: Lib.ColumnMetadata | undefined;
  isLhsColumn: boolean;
  onChange: (column: Lib.ColumnMetadata) => void;
  onClose: () => void;
}

function JoinColumnDropdown({
  query,
  stageIndex,
  joinable,
  lhsColumn,
  rhsColumn,
  isLhsColumn,
  onChange,
  onClose,
}: JoinColumnDropdownProps) {
  const columnGroups = useMemo(() => {
    const getColumns = isLhsColumn
      ? Lib.joinConditionLHSColumns
      : Lib.joinConditionRHSColumns;
    const columns = getColumns(
      query,
      stageIndex,
      joinable,
      lhsColumn,
      rhsColumn,
    );
    return Lib.groupColumns(columns);
  }, [query, stageIndex, joinable, lhsColumn, rhsColumn, isLhsColumn]);

  return (
    <JoinColumnPicker
      query={query}
      columnGroups={columnGroups}
      stageIndex={stageIndex}
      hasTemporalBucketing
      checkIsColumnSelected={checkColumnSelected}
      onSelect={onChange}
      onClose={onClose}
      data-testid={isLhsColumn ? "lhs-column-picker" : "rhs-column-picker"}
    />
  );
}

function checkColumnSelected(item: ColumnListItem) {
  return Boolean(item.selected);
}
