import { useMemo, useState } from "react";

import {
  type ColumnListItem,
  QueryColumnPicker,
} from "metabase/common/components/QueryColumnPicker";
import {
  ExpressionWidget,
  ExpressionWidgetHeader,
} from "metabase/query_builder/components/expressions/ExpressionWidget";
import type { DefinedClauseName } from "metabase/querying/expressions";
import * as Lib from "metabase-lib";

import { getJoinStrategyIcon } from "../../utils";

import S from "./JoinColumnDropdown.module.css";

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
  const [initialExpressionClause, setInitialExpressionClause] =
    useState<DefinedClauseName | null>(null);

  const { columns, columnGroups } = useMemo(() => {
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
    return { columns, columnGroups };
  }, [query, stageIndex, joinable, lhsExpression, rhsExpression, isLhsPicker]);

  const handleColumnSelect = (newColumn: Lib.ColumnMetadata) => {
    onChange(Lib.expressionClause(newColumn), Lib.temporalBucket(newColumn));
  };

  const handleExpressionSelect = (
    _newName: string,
    newExpression: Lib.ExpressionClause,
  ) => {
    onChange(newExpression, null);
    onClose();
  };

  const handleExpressionClauseSelect = (clause?: DefinedClauseName) => {
    setInitialExpressionClause(clause ?? null);
    setIsEditingExpression(true);
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
        initialExpressionClause={initialExpressionClause}
      />
    );
  }

  return (
    <QueryColumnPicker
      className={S.joinColumnPicker}
      query={query}
      stageIndex={stageIndex}
      columnGroups={columnGroups}
      hasTemporalBucketing
      checkIsColumnSelected={isColumnSelected}
      onSelect={handleColumnSelect}
      onSelectExpression={handleExpressionClauseSelect}
      expressionSectionIcon={getJoinStrategyIcon(
        Lib.displayInfo(query, stageIndex, strategy),
      )}
      onClose={onClose}
      data-testid={isLhsPicker ? "lhs-column-picker" : "rhs-column-picker"}
    />
  );
}

function isColumnSelected(item: ColumnListItem) {
  return Boolean(item.selected);
}

function isEditingExpressionInitially(
  expression: Lib.ExpressionClause | undefined,
) {
  return expression != null && !Lib.isJoinConditionLHSorRHSColumn(expression);
}
