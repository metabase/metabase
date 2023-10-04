import { useEffect, useCallback, useState, useMemo } from "react";
import { usePrevious } from "react-use";
import * as Lib from "metabase-lib";

export function useJoin(query: Lib.Query, stageIndex: number, join?: Lib.Join) {
  const previousQuery = usePrevious(query);
  const previousJoin = usePrevious(join);

  const [strategy, _setStrategy] = useState<Lib.JoinStrategy>(
    join ? Lib.joinStrategy(join) : getDefaultJoinStrategy(query, stageIndex),
  );
  const [table, _setTable] = useState(
    join ? Lib.joinedThing(query, join) : undefined,
  );
  const [conditions, _setConditions] = useState<Lib.JoinCondition[]>(
    join ? Lib.joinConditions(join) : [],
  );

  // This state is only used until a join is created
  // After that, we use `displayInfo(query, stageIndex, column).selected` to determine if a column is selected
  // We use "all" instead of `joinableColumns(query, stageIndex, table)`
  // to avoid race-conditions when the table metadata is not yet loaded
  const [selectedColumns, _setSelectedColumns] = useState<Lib.JoinFields>(
    join ? [] : "all",
  );

  const columns = useMemo(() => {
    if (join) {
      return Lib.joinableColumns(query, stageIndex, join);
    }
    if (table) {
      return Lib.joinableColumns(query, stageIndex, table);
    }
    return [];
  }, [query, stageIndex, join, table]);

  useEffect(() => {
    if (join && previousJoin !== join) {
      _setStrategy(Lib.joinStrategy(join));
      _setTable(Lib.joinedThing(query, join));
      _setConditions(Lib.joinConditions(join));
    }

    // Reset selected columns once a join is created,
    // because we can now use `displayInfo(query, stageIndex, column).selected`
    if (!previousJoin && join) {
      _setSelectedColumns([]);
    }
  }, [query, previousQuery, stageIndex, join, previousJoin]);

  const isColumnSelected = (column: Lib.ColumnMetadata) => {
    if (join) {
      return !!Lib.displayInfo(query, stageIndex, column).selected;
    }
    if (selectedColumns === "all") {
      return true;
    }
    if (selectedColumns === "none") {
      return false;
    }
    return selectedColumns.some(selectedColumn => column === selectedColumn);
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

        const nextQuery = join
          ? Lib.replaceClause(query, stageIndex, join, nextJoin)
          : Lib.join(query, stageIndex, nextJoin);

        return { nextQuery, hasConditions: true };
      }

      _setTable(nextTable);
      _setSelectedColumns("all");
      _setConditions([]);

      // With a new table and no suggested condition,
      // the existing join in no longer valid, so we remove it
      if (join) {
        const nextQuery = Lib.removeClause(query, stageIndex, join);
        return { nextQuery, hasConditions: false };
      }

      return { nextQuery: null, hasConditions: false };
    },
    [query, stageIndex, join, strategy],
  );

  const addCondition = useCallback(
    (condition: Lib.JoinCondition) => {
      const nextConditions = [...conditions, condition];
      _setConditions(nextConditions);

      if (join) {
        const nextJoin = Lib.withJoinConditions(join, nextConditions);
        return Lib.replaceClause(query, stageIndex, join, nextJoin);
      } else if (table) {
        let nextJoin = Lib.joinClause(table, nextConditions);
        nextJoin = Lib.withJoinFields(nextJoin, selectedColumns);
        nextJoin = Lib.withJoinStrategy(nextJoin, strategy);
        return Lib.join(query, stageIndex, nextJoin);
      }
    },
    [query, stageIndex, join, table, strategy, selectedColumns, conditions],
  );

  const updateCondition = useCallback(
    (conditionIndex: number, nextCondition: Lib.JoinCondition) => {
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

  const removeCondition = useCallback(
    (condition: Lib.JoinCondition) => {
      const nextConditions = conditions.filter(
        _condition => _condition !== condition,
      );
      _setConditions(nextConditions);
      return Lib.removeClause(query, stageIndex, condition);
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
    removeCondition,
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
