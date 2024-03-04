import { useEffect, useCallback, useState } from "react";
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
  const [joinableColumns, _setJoinableColumns] = useState<Lib.ColumnMetadata[]>(
    [],
  );
  const [selectedColumns, _setSelectedColumns] = useState<Lib.ColumnMetadata[]>(
    [],
  );

  useEffect(() => {
    if (join && previousJoin !== join) {
      _setStrategy(Lib.joinStrategy(join));
      _setTable(Lib.joinedThing(query, join));
      _setConditions(Lib.joinConditions(join));
    }
  }, [query, previousQuery, stageIndex, join, previousJoin]);

  const getColumns = () => {
    return join
      ? Lib.joinableColumns(query, stageIndex, join)
      : joinableColumns;
  };

  const getTableJoinFields = (
    joinableColumns: Lib.ColumnMetadata[],
    selectedColumns: Lib.ColumnMetadata[],
  ): Lib.JoinFields => {
    if (joinableColumns.length === selectedColumns.length) {
      return "all";
    } else if (selectedColumns.length === 0) {
      return "none";
    } else {
      return selectedColumns;
    }
  };

  const isColumnSelected = (
    column: Lib.ColumnMetadata,
    columnInfo: Lib.ColumnDisplayInfo,
  ) => {
    return join
      ? Boolean(columnInfo.selected)
      : selectedColumns.includes(column);
  };

  const toggleSelectedColumn = (
    column: Lib.ColumnMetadata,
    isSelected: boolean,
  ) => {
    if (join) {
      return isSelected
        ? Lib.addField(query, stageIndex, column)
        : Lib.removeField(query, stageIndex, column);
    }

    const newSelectedColumns = [...selectedColumns];
    if (isSelected) {
      newSelectedColumns.push(column);
    } else {
      const columnIndex = selectedColumns.indexOf(column);
      newSelectedColumns.splice(columnIndex, 1);
    }
    _setSelectedColumns(newSelectedColumns);
  };

  const setSelectedColumns = (nextColumns: Lib.JoinFields) => {
    if (join) {
      const nextJoin = Lib.withJoinFields(join, nextColumns);
      return Lib.replaceClause(query, stageIndex, join, nextJoin);
    } else if (nextColumns === "all") {
      _setSelectedColumns(joinableColumns);
    } else if (nextColumns === "none") {
      _setSelectedColumns([]);
    } else {
      _setSelectedColumns(nextColumns);
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
      const suggestedConditions = Lib.suggestedJoinConditions(
        query,
        stageIndex,
        nextTable,
      );

      if (suggestedConditions.length > 0) {
        _setConditions(suggestedConditions);

        let nextJoin = Lib.joinClause(nextTable, suggestedConditions);
        nextJoin = Lib.withJoinFields(nextJoin, "all");
        nextJoin = Lib.withJoinStrategy(nextJoin, strategy);

        const nextQuery = join
          ? Lib.replaceClause(query, stageIndex, join, nextJoin)
          : Lib.join(query, stageIndex, nextJoin);

        return { nextQuery, hasConditions: true };
      }

      const nextColumns = Lib.joinableColumns(query, stageIndex, nextTable);
      _setTable(nextTable);
      _setJoinableColumns(nextColumns);
      _setSelectedColumns(nextColumns);
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
        const joinFields = getTableJoinFields(joinableColumns, selectedColumns);
        let nextJoin = Lib.joinClause(table, nextConditions);
        nextJoin = Lib.withJoinFields(nextJoin, joinFields);
        nextJoin = Lib.withJoinStrategy(nextJoin, strategy);
        return Lib.join(query, stageIndex, nextJoin);
      }
    },
    [
      query,
      stageIndex,
      join,
      table,
      joinableColumns,
      selectedColumns,
      strategy,
      conditions,
    ],
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
    getColumns,
    conditions,
    setStrategy,
    setTable,
    addCondition,
    updateCondition,
    removeCondition,
    isColumnSelected,
    toggleSelectedColumn,
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
