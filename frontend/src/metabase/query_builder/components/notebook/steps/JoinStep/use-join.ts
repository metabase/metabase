import { useEffect, useCallback, useState } from "react";
import { usePrevious } from "react-use";
import Tables from "metabase/entities/tables";
import { useDispatch } from "metabase/lib/redux";
import * as Lib from "metabase-lib";

export function useJoin(query: Lib.Query, stageIndex: number, join?: Lib.Join) {
  const dispatch = useDispatch();
  const previousJoin = usePrevious(join);

  const [strategy, _setStrategy] = useState<Lib.JoinStrategy>(
    join ? Lib.joinStrategy(join) : getDefaultJoinStrategy(query, stageIndex),
  );
  const [table, _setTable] = useState(
    join ? Lib.joinedThing(query, join) : undefined,
  );
  const [conditions, _setConditions] = useState<Lib.JoinConditionClause[]>(
    join ? Lib.joinConditions(join) : [],
  );

  const previousTable = usePrevious(table);

  useEffect(() => {
    if (join && previousJoin !== join) {
      _setStrategy(Lib.joinStrategy(join));
      _setTable(Lib.joinedThing(query, join));
      _setConditions(Lib.joinConditions(join));
    }
  }, [query, stageIndex, join, previousJoin]);

  useEffect(() => {
    if (table && table !== previousTable) {
      const info = Lib.pickerInfo(query, table);
      const tableId = info.tableId || info.cardId;
      dispatch(Tables.actions.fetchMetadata({ id: tableId }));
    }
  }, [query, table, previousTable, dispatch]);

  const setStrategy = useCallback(
    (nextStrategy: Lib.JoinStrategy) => {
      _setStrategy(nextStrategy);
      if (join) {
        const nextJoin = Lib.withJoinStrategy(join, nextStrategy);
        return Lib.replaceClause(query, stageIndex, join, nextJoin);
      }
    },
    [query, stageIndex, join],
  );

  const setTable = useCallback((nextTable: Lib.Joinable) => {
    _setTable(nextTable);
    _setConditions([]);
  }, []);

  const addCondition = useCallback(
    (condition: Lib.JoinConditionClause) => {
      const nextConditions = [...conditions, condition];
      _setConditions(nextConditions);

      if (table) {
        let nextJoin = Lib.joinClause(table, nextConditions);
        nextJoin = Lib.withJoinFields(nextJoin, "all");
        nextJoin = Lib.withJoinStrategy(nextJoin, strategy);
        return Lib.join(query, stageIndex, nextJoin);
      }
    },
    [query, stageIndex, table, strategy, conditions],
  );

  const updateCondition = useCallback(
    (conditionIndex: number, nextCondition: Lib.JoinConditionClause) => {
      const currentCondition = conditions[conditionIndex];
      const nextConditions = [...conditions];
      nextConditions[conditionIndex] = nextCondition;
      _setConditions(nextConditions);
      return Lib.replaceClause(
        query,
        stageIndex,
        currentCondition,
        nextCondition,
      );
    },
    [query, stageIndex, conditions],
  );

  return {
    strategy,
    table,
    conditions,
    setStrategy,
    setTable,
    addCondition,
    updateCondition,
  };
}

function getDefaultJoinStrategy(query: Lib.Query, stageIndex: number) {
  const strategies = Lib.availableJoinStrategies(query, stageIndex);
  const defaultStrategy = strategies.find(
    strategy => Lib.displayInfo(query, stageIndex, strategy).default,
  );
  return defaultStrategy || strategies[0];
}
