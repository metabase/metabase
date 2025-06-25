import cx from "classnames";
import type { Ref } from "react";
import { forwardRef, useMemo } from "react";
import { t } from "ttag";

import {
  type ColumnListItem,
  QueryColumnPicker,
} from "metabase/common/components/QueryColumnPicker";
import { Popover, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./JoinConditionColumnPicker.module.css";

interface JoinConditionColumnPickerProps {
  query: Lib.Query;
  stageIndex: number;
  joinable: Lib.JoinOrJoinable;
  tableName: string | undefined;
  lhsExpression: Lib.ExpressionClause | undefined;
  rhsExpression: Lib.ExpressionClause | undefined;
  isOpened: boolean;
  isLhsExpression: boolean;
  isReadOnly: boolean;
  onChange: (
    newExpression: Lib.ExpressionClause,
    newTemporalBucket: Lib.Bucket | null,
  ) => void;
  onOpenChange: (isOpened: boolean) => void;
}

export function JoinConditionColumnPicker({
  query,
  stageIndex,
  joinable,
  tableName,
  lhsExpression,
  rhsExpression,
  isOpened,
  isLhsExpression,
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
          tableName={tableName}
          lhsExpression={lhsExpression}
          rhsExpression={rhsExpression}
          isLhsExpression={isLhsExpression}
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
          lhsExpression={lhsExpression}
          rhsExpression={rhsExpression}
          isLhsExpression={isLhsExpression}
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
  tableName: string | undefined;
  lhsExpression: Lib.ExpressionClause | undefined;
  rhsExpression: Lib.ExpressionClause | undefined;
  isLhsExpression: boolean;
  isOpened: boolean;
  isReadOnly: boolean;
  onClick: () => void;
}

const JoinColumnTarget = forwardRef(function JoinColumnTarget(
  {
    query,
    stageIndex,
    tableName,
    lhsExpression,
    rhsExpression,
    isLhsExpression,
    isOpened,
    isReadOnly,
    onClick,
  }: JoinColumnTargetProps,
  ref: Ref<HTMLButtonElement>,
) {
  const column = isLhsExpression ? lhsExpression : rhsExpression;
  const columnInfo = useMemo(
    () => (column ? Lib.displayInfo(query, stageIndex, column) : undefined),
    [query, stageIndex, column],
  );

  return (
    <button
      className={cx(S.JoinCellItem, {
        [S.isReadOnly]: isReadOnly,
        [S.hasColumnStyle]: column != null,
        [S.noColumnStyle]: column == null,
        [S.isOpen]: isOpened,
      })}
      ref={ref}
      disabled={isReadOnly}
      onClick={onClick}
      aria-label={isLhsExpression ? t`Left column` : t`Right column`}
    >
      {tableName != null && (
        <Text
          display="block"
          fz={11}
          lh={1}
          color={columnInfo ? "text-white" : "brand"}
          ta="left"
          fw={400}
        >
          {tableName}
        </Text>
      )}
      <Text
        display="block"
        color={columnInfo ? "text-white" : "brand"}
        ta="left"
        fw={700}
        lh={1}
      >
        {columnInfo?.displayName ?? t`Pick a column…`}
      </Text>
    </button>
  );
});

interface JoinColumnDropdownProps {
  query: Lib.Query;
  stageIndex: number;
  joinable: Lib.JoinOrJoinable;
  lhsExpression: Lib.ExpressionClause | undefined;
  rhsExpression: Lib.ExpressionClause | undefined;
  isLhsExpression: boolean;
  onChange: (
    newExpression: Lib.ExpressionClause,
    newTemporalBucket: Lib.Bucket | null,
  ) => void;
  onClose: () => void;
}

function JoinColumnDropdown({
  query,
  stageIndex,
  joinable,
  lhsExpression,
  rhsExpression,
  isLhsExpression,
  onChange,
  onClose,
}: JoinColumnDropdownProps) {
  const columnGroups = useMemo(() => {
    const getColumns = isLhsExpression
      ? Lib.joinConditionLHSColumns
      : Lib.joinConditionRHSColumns;
    const columns = getColumns(
      query,
      stageIndex,
      joinable,
      lhsExpression,
      rhsExpression,
    );
    return Lib.groupColumns(columns);
  }, [
    query,
    stageIndex,
    joinable,
    lhsExpression,
    rhsExpression,
    isLhsExpression,
  ]);

  const handleColumnSelect = (newColumn: Lib.ColumnMetadata) => {
    onChange(Lib.expressionClause(newColumn), Lib.temporalBucket(newColumn));
  };

  return (
    <QueryColumnPicker
      className={S.JoinColumnPicker}
      query={query}
      columnGroups={columnGroups}
      stageIndex={stageIndex}
      hasTemporalBucketing
      checkIsColumnSelected={checkIsColumnSelected}
      onSelect={handleColumnSelect}
      onClose={onClose}
      data-testid={isLhsExpression ? "lhs-column-picker" : "rhs-column-picker"}
    />
  );
}

function checkIsColumnSelected(item: ColumnListItem) {
  return Boolean(item.selected);
}
