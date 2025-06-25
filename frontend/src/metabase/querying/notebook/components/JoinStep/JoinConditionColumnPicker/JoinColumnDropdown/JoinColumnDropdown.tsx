import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  type ColumnListItem,
  QueryColumnPicker,
  type QueryColumnPickerSection,
} from "metabase/common/components/QueryColumnPicker";
import { ExpressionWidget } from "metabase/query_builder/components/expressions/ExpressionWidget";
import { ExpressionWidgetHeader } from "metabase/query_builder/components/expressions/ExpressionWidgetHeader";
import * as Lib from "metabase-lib";

import { getJoinStrategyIcon } from "../../utils";

import S from "./JoinColumnDropdown.module.css";

const CUSTOM_EXPRESSION_SECTION_KEY = "custom-expression";

type JoinColumnDropdownProps = {
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
};

export function JoinColumnDropdown({
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
  const [isExpressionEditorOpen, setIsExpressionEditorOpen] = useState(() =>
    isExpressionEditorInitiallyOpen(query, stageIndex, columns, expression),
  );

  const handleColumnSelect = (newColumn: Lib.ColumnMetadata) => {
    onChange(Lib.expressionClause(newColumn), Lib.temporalBucket(newColumn));
  };

  const handleSectionSelect = (newSection: QueryColumnPickerSection) => {
    if (newSection.key === CUSTOM_EXPRESSION_SECTION_KEY) {
      setIsExpressionEditorOpen(true);
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
    setIsExpressionEditorOpen(false);
  };

  if (isExpressionEditorOpen) {
    return (
      <ExpressionWidget
        query={query}
        stageIndex={stageIndex}
        availableColumns={columns}
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
  return (
    expression != null &&
    columns.every(
      (column) => !Lib.displayInfo(query, stageIndex, column).selected,
    )
  );
}

function checkIsColumnSelected(item: ColumnListItem) {
  return Boolean(item.selected);
}
