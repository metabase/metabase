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
  isLhsPicker: boolean;
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
  isLhsPicker,
  onChange,
  onClose,
}: JoinColumnDropdownProps) {
  const expression = isLhsPicker ? lhsExpression : rhsExpression;
  const [isEditingExpression, setIsEditingExpression] = useState(() =>
    isEditingExpressionInitially(expression),
  );

  const { columns, columnGroups, extraSections } = useMemo(() => {
    const getColumns = isLhsPicker
      ? Lib.joinConditionLHSColumns
      : Lib.joinConditionRHSColumns;
    const columns = getColumns(
      query,
      stageIndex,
      joinable,
      lhsExpression,
      rhsExpression,
    );
    const columnGroups = Lib.groupColumns(columns);
    const extraSections = getExtraSections(query, stageIndex, strategy);
    return { columns, columnGroups, extraSections };
  }, [
    query,
    stageIndex,
    joinable,
    strategy,
    lhsExpression,
    rhsExpression,
    isLhsPicker,
  ]);

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
      checkIsColumnSelected={isColumnSelected}
      onSelect={handleColumnSelect}
      onSelectSection={handleSectionSelect}
      onClose={onClose}
      data-testid={isLhsPicker ? "lhs-column-picker" : "rhs-column-picker"}
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

function isColumnSelected(item: ColumnListItem) {
  return Boolean(item.selected);
}

function isEditingExpressionInitially(
  expression: Lib.ExpressionClause | undefined,
) {
  return expression != null && !Lib.isJoinConditionLHSorRHSColumn(expression);
}
