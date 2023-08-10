import { useMemo, useState } from "react";
import * as Lib from "metabase-lib";

export function useJoinCondition(
  query: Lib.Query,
  stageIndex: number,
  table: Lib.Joinable,
  join?: Lib.Join,
  condition?: Lib.JoinConditionClause,
) {
  const externalOp = condition ? Lib.externalOp(condition) : undefined;
  const [initialLHSColumn, initialRHSColumn] = externalOp?.args || [];

  const [lhsColumn, _setLHSColumn] = useState<Lib.ColumnMetadata | undefined>(
    initialLHSColumn,
  );
  const [rhsColumn, _setRHSColumn] = useState<Lib.ColumnMetadata | undefined>(
    initialRHSColumn,
  );
  const [operator, _setOperator] = useState<Lib.FilterOperator | undefined>(
    getInitialConditionOperator(query, stageIndex, condition),
  );

  const operators = useMemo(
    () => Lib.joinConditionOperators(query, stageIndex),
    [query, stageIndex],
  );

  const lhsColumns = useMemo(
    () =>
      Lib.joinConditionLHSColumns(
        query,
        stageIndex,
        join || table,
        lhsColumn,
        rhsColumn,
      ),
    [query, stageIndex, join, table, lhsColumn, rhsColumn],
  );

  const rhsColumns = useMemo(
    () =>
      Lib.joinConditionRHSColumns(
        query,
        stageIndex,
        join || table,
        lhsColumn,
        rhsColumn,
      ),
    [query, stageIndex, join, table, lhsColumn, rhsColumn],
  );

  const setOperator = (operator: Lib.FilterOperator) => {
    _setOperator(operator);
    if (lhsColumn && rhsColumn) {
      return Lib.joinConditionClause(operator, lhsColumn, rhsColumn);
    }
  };

  const setLHSColumn = (lhsColumn: Lib.ColumnMetadata) => {
    _setLHSColumn(lhsColumn);
    if (operator && lhsColumn && rhsColumn) {
      return Lib.joinConditionClause(operator, lhsColumn, rhsColumn);
    }
  };

  const setRHSColumn = (rhsColumn: Lib.ColumnMetadata) => {
    _setRHSColumn(rhsColumn);
    if (operator && lhsColumn && rhsColumn) {
      return Lib.joinConditionClause(operator, lhsColumn, rhsColumn);
    }
  };

  return {
    lhsColumn,
    rhsColumn,
    operator,
    operators,
    lhsColumns,
    rhsColumns,
    setOperator,
    setLHSColumn,
    setRHSColumn,
  };
}

function getConditionOperator(
  query: Lib.Query,
  stageIndex: number,
  condition: Lib.JoinConditionClause,
) {
  const operators = Lib.joinConditionOperators(query, stageIndex);
  const { operator } = Lib.externalOp(condition);
  return operators.find(
    op => Lib.displayInfo(query, stageIndex, op).shortName === operator,
  );
}

function getDefaultJoinOperator(
  query: Lib.Query,
  stageIndex: number,
  lhsColumn: Lib.ColumnMetadata | undefined,
  rhsColumn: Lib.ColumnMetadata | undefined,
) {
  const operators = Lib.joinConditionOperators(
    query,
    stageIndex,
    lhsColumn,
    rhsColumn,
  );
  const defaultOperator = operators.find(
    operator => Lib.displayInfo(query, stageIndex, operator).default,
  );
  return defaultOperator || operators[0];
}

function getInitialConditionOperator(
  query: Lib.Query,
  stageIndex: number,
  condition?: Lib.JoinConditionClause,
) {
  if (condition) {
    const externalOp = Lib.externalOp(condition);
    const [lhsColumn, rhsColumn] = externalOp.args;
    return (
      getConditionOperator(query, stageIndex, condition) ||
      getDefaultJoinOperator(query, stageIndex, lhsColumn, rhsColumn)
    );
  } else {
    return getDefaultJoinOperator(query, stageIndex, undefined, undefined);
  }
}
