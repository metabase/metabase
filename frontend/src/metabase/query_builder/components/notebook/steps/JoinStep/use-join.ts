import { useEffect, useCallback, useState } from "react";
import { usePrevious } from "react-use";
import * as Lib from "metabase-lib";

export function useJoin(query: Lib.Query, stageIndex: number, join?: Lib.Join) {
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
  const [selectedColumns, _setSelectedColumns] = useState(
    getInitiallySelectedColumns(query, stageIndex, join),
  );

  const columns = join
    ? Lib.joinableColumns(query, stageIndex, join)
    : table
    ? Lib.joinableColumns(query, stageIndex, table)
    : [];

  useEffect(() => {
    if (join && previousJoin !== join) {
      _setStrategy(Lib.joinStrategy(join));
      _setTable(Lib.joinedThing(query, join));
      _setConditions(Lib.joinConditions(join));
    }
    if (!previousJoin && join) {
      _setSelectedColumns([]);
    }
  }, [query, stageIndex, join, previousJoin]);

  const isColumnSelected = (column: Lib.ColumnMetadata) => {
    if (join) {
      return !!Lib.displayInfo(query, stageIndex, column).selected;
    }
    return selectedColumns.some(selectedColumn =>
      Lib.isSameColumn(query, stageIndex, selectedColumn, column),
    );
  };

  const setSelectedColumns = (nextSelectedColumns: Lib.JoinFields) => {
    if (join) {
      const nextJoin = Lib.withJoinFields(join, nextSelectedColumns);
      const nextQuery = Lib.replaceClause(query, stageIndex, join, nextJoin);
      return nextQuery;
    }

    // Table should be in place, it's a check for TypeScript
    if (!table) {
      return;
    }

    if (nextSelectedColumns === "all") {
      const columns = Lib.joinableColumns(query, stageIndex, table);
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
