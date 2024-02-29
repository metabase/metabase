import { useEffect, useMemo, useState } from "react";
import { usePrevious } from "react-use";

import * as Lib from "metabase-lib";

export function useJoinCondition(
  query: Lib.Query,
  stageIndex: number,
  table: Lib.Joinable,
  join?: Lib.Join,
  condition?: Lib.JoinCondition,
) {
  const previousCondition = usePrevious(condition);

  const conditionParts = condition
    ? Lib.joinConditionParts(query, stageIndex, condition)
    : undefined;

  const [lhsColumn, _setLHSColumn] = useState<Lib.ColumnMetadata | undefined>(
    conditionParts?.lhsColumn,
  );
  const [rhsColumn, _setRHSColumn] = useState<Lib.ColumnMetadata | undefined>(
    conditionParts?.rhsColumn,
  );
  const [operator, _setOperator] = useState<
    Lib.JoinConditionOperator | undefined
  >(getInitialConditionOperator(query, stageIndex, conditionParts));

  useEffect(() => {
    if (condition && previousCondition !== condition) {
      const { operator, lhsColumn, rhsColumn } = Lib.joinConditionParts(
        query,
        stageIndex,
        condition,
      );
      _setLHSColumn(lhsColumn);
      _setRHSColumn(rhsColumn);
      _setOperator(operator);
    }
  }, [query, stageIndex, condition, previousCondition]);

  const operators = useMemo(
    () => Lib.joinConditionOperators(query, stageIndex),
    [query, stageIndex],
  );

  const setOperator = (operator: Lib.JoinConditionOperator) => {
    _setOperator(operator);
    if (lhsColumn && rhsColumn) {
      return Lib.joinConditionClause(
        query,
        stageIndex,
        operator,
        lhsColumn,
        rhsColumn,
      );
    }
  };

  const maybeSyncTemporalUnit = (
    condition: Lib.JoinCondition,
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
      let condition = Lib.joinConditionClause(
        query,
        stageIndex,
        operator,
        lhsColumn,
        rhsColumn,
      );
      condition = maybeSyncTemporalUnit(condition, lhsColumn, rhsColumn);

      const { lhsColumn: nextLHSColumn, rhsColumn: nextRHSColumn } =
        Lib.joinConditionParts(query, stageIndex, condition);

      _setLHSColumn(nextLHSColumn);
      _setRHSColumn(nextRHSColumn);

      return condition;
    } else {
      _setLHSColumn(lhsColumn);
    }
  };

  const setRHSColumn = (rhsColumn: Lib.ColumnMetadata) => {
    if (operator && lhsColumn && rhsColumn) {
      let condition = Lib.joinConditionClause(
        query,
        stageIndex,
        operator,
        lhsColumn,
        rhsColumn,
      );
      condition = maybeSyncTemporalUnit(condition, rhsColumn, lhsColumn);

      const { lhsColumn: nextLHSColumn, rhsColumn: nextRHSColumn } =
        Lib.joinConditionParts(query, stageIndex, condition);

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
    setOperator,
    setLHSColumn,
    setRHSColumn,
  };
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
  conditionParts: Lib.JoinConditionParts | undefined,
) {
  if (conditionParts) {
    const { operator, lhsColumn, rhsColumn } = conditionParts;

    return (
      operator ||
      getDefaultJoinOperator(query, stageIndex, lhsColumn, rhsColumn)
    );
  }

  return getDefaultJoinOperator(query, stageIndex, undefined, undefined);
}
