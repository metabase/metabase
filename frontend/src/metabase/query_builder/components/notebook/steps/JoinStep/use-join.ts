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
  const [columns, _setColumns] = useState(
    join ? Lib.joinableColumns(query, stageIndex, join) : [],
  );
  const [selectedColumns, _setSelectedColumns] = useState(
    getInitiallySelectedColumns(query, stageIndex, join),
  );

  const previousTable = usePrevious(table);

  useEffect(() => {
    if (join && previousJoin !== join) {
      _setStrategy(Lib.joinStrategy(join));
      _setTable(Lib.joinedThing(query, join));
      _setColumns(Lib.joinableColumns(query, stageIndex, join));
      _setConditions(Lib.joinConditions(join));
    }
    if (!previousJoin && join) {
      _setSelectedColumns([]);
    }
  }, [query, stageIndex, join, previousJoin]);

  useEffect(() => {
    if (table && table !== previousTable) {
      const info = Lib.pickerInfo(query, table);
      const tableId = info.tableId || info.cardId;
      dispatch(Tables.actions.fetchMetadata({ id: tableId }));
    }
  }, [query, table, previousTable, dispatch]);

  const isColumnSelected = (column: Lib.ColumnMetadata) => {
    return join
      ? !!Lib.displayInfo(query, stageIndex, column).selected
      : selectedColumns.includes(column);
  };

  const setSelectedColumns = (nextSelectedColumns: Lib.JoinFields) => {
    if (join) {
      const nextJoin = Lib.withJoinFields(join, nextSelectedColumns);
      const nextQuery = Lib.replaceClause(query, stageIndex, join, nextJoin);
      _setColumns(Lib.joinableColumns(nextQuery, stageIndex, nextJoin));
      return nextQuery;
    }

    if (nextSelectedColumns === "all") {
      _setSelectedColumns(columns);
    } else if (nextSelectedColumns === "none") {
      _setSelectedColumns([]);
    } else {
      _setSelectedColumns(nextSelectedColumns);
    }
  };

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

  const setTable = useCallback(
    (nextTable: Lib.Joinable) => {
      const suggestedCondition = Lib.suggestedJoinCondition(
        query,
        stageIndex,
        nextTable,
      );

      if (suggestedCondition) {
        const nextConditions = [suggestedCondition];
        _setConditions(nextConditions);
        let nextJoin = Lib.joinClause(nextTable, nextConditions);
        nextJoin = Lib.withJoinFields(nextJoin, "all");
        nextJoin = Lib.withJoinStrategy(nextJoin, strategy);
        return Lib.join(query, stageIndex, nextJoin);
      } else {
        const columns = Lib.joinableColumns(query, stageIndex, nextTable);
        _setTable(nextTable);
        _setColumns(columns);
        _setSelectedColumns(columns);
        _setConditions([]);
      }
    },
    [query, stageIndex, strategy],
  );

  const addCondition = useCallback(
    (condition: Lib.JoinConditionClause) => {
      const nextConditions = [...conditions, condition];
      _setConditions(nextConditions);

      if (table) {
        let nextJoin = Lib.joinClause(table, nextConditions);
        nextJoin = Lib.withJoinFields(nextJoin, selectedColumns);
        nextJoin = Lib.withJoinStrategy(nextJoin, strategy);
        return Lib.join(query, stageIndex, nextJoin);
      }
    },
    [query, stageIndex, table, strategy, selectedColumns, conditions],
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
    columns,
    conditions,
    setStrategy,
    setTable,
    addCondition,
    updateCondition,
    isColumnSelected,
    setSelectedColumns,
  };
}

function getDefaultJoinStrategy(query: Lib.Query, stageIndex: number) {
  const strategies = Lib.availableJoinStrategies(query, stageIndex);
  const defaultStrategy = strategies.find(
    strategy => Lib.displayInfo(query, stageIndex, strategy).default,
  );
  return defaultStrategy || strategies[0];
}

function getInitiallySelectedColumns(
  query: Lib.Query,
  stageIndex: number,
  join?: Lib.Join,
) {
  if (!join) {
    return [];
  }
  const columns = Lib.joinableColumns(query, stageIndex, join);
  return columns.filter(
    column => Lib.displayInfo(query, stageIndex, column).selected,
  );
}
