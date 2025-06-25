import cx from "classnames";
import type { Ref } from "react";
import { forwardRef, useMemo, useState } from "react";
import { t } from "ttag";

import {
  type ColumnListItem,
  QueryColumnPicker,
  type QueryColumnPickerSection,
} from "metabase/common/components/QueryColumnPicker";
import { ExpressionWidget } from "metabase/query_builder/components/expressions/ExpressionWidget";
import { ExpressionWidgetHeader } from "metabase/query_builder/components/expressions/ExpressionWidgetHeader";
import { Popover, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { getJoinStrategyIcon } from "../utils";

import S from "./JoinConditionColumnPicker.module.css";

interface JoinConditionColumnPickerProps {
  query: Lib.Query;
  stageIndex: number;
  joinable: Lib.JoinOrJoinable;
  strategy: Lib.JoinStrategy;
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
  strategy,
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
          strategy={strategy}
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

const CUSTOM_EXPRESSION_SECTION_KEY = "custom-expression";

interface JoinColumnDropdownProps {
  query: Lib.Query;
  stageIndex: number;
  joinable: Lib.JoinOrJoinable;
  strategy: Lib.JoinStrategy;
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
  strategy,
  lhsExpression,
  rhsExpression,
  isLhsExpression,
  onChange,
  onClose,
}: JoinColumnDropdownProps) {
  const columns = useMemo(() => {
    const getColumns = isLhsExpression
      ? Lib.joinConditionLHSColumns
      : Lib.joinConditionRHSColumns;
    return getColumns(
      query,
      stageIndex,
      joinable,
      lhsExpression,
      rhsExpression,
    );
  }, [
    query,
    stageIndex,
    joinable,
    lhsExpression,
    rhsExpression,
    isLhsExpression,
  ]);

  const columnGroups = useMemo(() => Lib.groupColumns(columns), [columns]);
  const extraSections = useMemo(
    () => getExtraSections(query, stageIndex, strategy),
    [query, stageIndex, strategy],
  );

  const expression = isLhsExpression ? lhsExpression : rhsExpression;
  const [isEditingExpression, setIsEditingExpression] = useState(() =>
    isExpressionEditorInitiallyOpen(query, stageIndex, columns, expression),
  );

  const handleColumnSelect = (newColumn: Lib.ColumnMetadata) => {
    onChange(Lib.expressionClause(newColumn), Lib.temporalBucket(newColumn));
  };

  const handleSectionSelect = (newSection: QueryColumnPickerSection) => {
    if (newSection.key === CUSTOM_EXPRESSION_SECTION_KEY) {
      setIsEditingExpression(true);
    }
  };

  const handleExpressionSelect = (
    _newName: string,
    newExpression: Lib.ExpressionClause,
  ) => {
    onChange(newExpression, null);
    onClose();
  };

  const handleExpressionEditorClose = () => {
    setIsEditingExpression(false);
  };

  if (isEditingExpression) {
    return (
      <ExpressionWidget
        query={query}
        stageIndex={stageIndex}
        clause={expression}
        expressionMode="expression"
        header={<ExpressionWidgetHeader onBack={handleExpressionEditorClose} />}
        onChangeClause={handleExpressionSelect}
        onClose={handleExpressionEditorClose}
      />
    );
  }

  return (
    <QueryColumnPicker
      className={S.JoinColumnPicker}
      query={query}
      stageIndex={stageIndex}
      columnGroups={columnGroups}
      extraSections={extraSections}
      hasTemporalBucketing
      checkIsColumnSelected={checkIsColumnSelected}
      onSelect={handleColumnSelect}
      onSelectSection={handleSectionSelect}
      onClose={onClose}
      data-testid={isLhsExpression ? "lhs-column-picker" : "rhs-column-picker"}
    />
  );
}

function getExtraSections(
  query: Lib.Query,
  stageIndex: number,
  strategy: Lib.JoinStrategy,
): QueryColumnPickerSection[] {
  const strategyInfo = Lib.displayInfo(query, stageIndex, strategy);

  return [
    {
      key: CUSTOM_EXPRESSION_SECTION_KEY,
      type: "action",
      name: t`Custom Expression`,
      items: [],
      icon: getJoinStrategyIcon(strategyInfo),
    },
  ];
}

function isExpressionEditorInitiallyOpen(
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
  expression: Lib.ExpressionClause | undefined,
) {
  if (!expression) {
    return false;
  }

  const isSomeColumnSelected = columns.some(
    (column) => Lib.displayInfo(query, stageIndex, column).selected,
  );
  return !isSomeColumnSelected;
}

function checkIsColumnSelected(item: ColumnListItem) {
  return Boolean(item.selected);
}
