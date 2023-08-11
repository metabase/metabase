import { useEffect, useMemo, useState } from "react";
import { usePrevious } from "react-use";
import * as Lib from "metabase-lib";

export function useJoinCondition(
  query: Lib.Query,
  stageIndex: number,
  table: Lib.Joinable,
  join?: Lib.Join,
  condition?: Lib.JoinConditionClause,
) {
  const previousCondition = usePrevious(condition);

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

  useEffect(() => {
    if (condition && previousCondition !== condition) {
      const externalOp = Lib.externalOp(condition);
      _setLHSColumn(externalOp?.args[0]);
      _setRHSColumn(externalOp?.args[1]);
      _setOperator(getConditionOperator(query, stageIndex, condition));
    }
  }, [query, stageIndex, condition, previousCondition]);

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

  const maybeSyncTemporalUnit = (
    condition: Lib.JoinConditionClause,
    col1: Lib.ColumnMetadata,
    col2: Lib.ColumnMetadata,
  ) => {
    const bucket = Lib.temporalBucket(col1) || Lib.temporalBucket(col2);

    if (bucket) {
      return Lib.joinConditionUpdateTemporalBucketing(
        query,
        stageIndex,
        condition,
        bucket,
      );
    }

    return condition;
  };

  const setLHSColumn = (lhsColumn: Lib.ColumnMetadata) => {
    if (operator && lhsColumn && rhsColumn) {
      let condition = Lib.joinConditionClause(operator, lhsColumn, rhsColumn);
      condition = maybeSyncTemporalUnit(condition, lhsColumn, rhsColumn);

      const [nextLHSColumn, nextRHSColumn] = Lib.externalOp(condition).args;
      _setLHSColumn(nextLHSColumn);
      _setRHSColumn(nextRHSColumn);

      return condition;
    } else {
      _setLHSColumn(lhsColumn);
    }
  };

  const setRHSColumn = (rhsColumn: Lib.ColumnMetadata) => {
    if (operator && lhsColumn && rhsColumn) {
      let condition = Lib.joinConditionClause(operator, lhsColumn, rhsColumn);
      condition = maybeSyncTemporalUnit(condition, rhsColumn, lhsColumn);

      const [nextLHSColumn, nextRHSColumn] = Lib.externalOp(condition).args;
      _setLHSColumn(nextLHSColumn);
      _setRHSColumn(nextRHSColumn);

      return condition;
    } else {
      _setRHSColumn(rhsColumn);
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
