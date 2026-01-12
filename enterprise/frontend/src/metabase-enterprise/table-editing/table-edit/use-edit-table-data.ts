import type { Location } from "history";
import { useCallback } from "react";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatasetColumn } from "metabase-types/api";

import { useAdHocTableQuery } from "./use-adhoc-table-query";

type Props = {
  tableId: number;
  databaseId: number;
  location: Location<{ query?: string }>;
};

export type TableDataGetColumnSortDirection = (
  column: DatasetColumn,
) => Lib.OrderByDirection | undefined;

export function useEditTableData({ tableId, databaseId, location }: Props) {
  const { tableQuestion, tableQuery, handleTableQuestionChange } =
    useAdHocTableQuery({ tableId, databaseId, location });

  const getColumnSortDirection = useCallback(
    (columnOrField: DatasetColumn) => {
      if (!tableQuestion || !columnOrField) {
        return;
      }

      const { query, stageIndex, column } = getQueryColumn(
        tableQuestion,
        columnOrField,
      );

      if (column != null) {
        const columnInfo = Lib.displayInfo(query, stageIndex, column);
        if (columnInfo.orderByPosition != null) {
          const orderBysMap = Lib.orderBys(query, stageIndex);
          const orderBy = orderBysMap[columnInfo.orderByPosition];
          const orderByInfo = Lib.displayInfo(query, stageIndex, orderBy);
          return orderByInfo.direction;
        }
      }
    },
    [tableQuestion],
  );

  const handleChangeColumnSort = useCallback(
    (columnOrField: DatasetColumn) => {
      if (!tableQuestion) {
        return;
      }

      const { query, stageIndex, column } = getQueryColumn(
        tableQuestion,
        columnOrField,
      );

      if (column) {
        const sortDirection = getColumnSortDirection(columnOrField);

        let newQuery: Lib.Query;
        if (sortDirection === "asc") {
          // have existing sorting by asc, then make it desc
          const clauses = Lib.orderBys(query, stageIndex);
          newQuery = Lib.changeDirection(query, clauses[0]);
        } else if (sortDirection === "desc") {
          // have existing sorting by desc, then remove sorting - WRK-446
          newQuery = Lib.removeOrderBys(query, stageIndex);
        } else {
          // no existing sorting on this column - apply new sorting (default - by asc)
          newQuery = Lib.orderBy(
            Lib.removeOrderBys(query, stageIndex),
            stageIndex,
            column,
          );
        }

        const newQuestion = tableQuestion.setQuery(newQuery);
        handleTableQuestionChange?.(newQuestion);
      }
    },
    [tableQuestion, getColumnSortDirection, handleTableQuestionChange],
  );

  const { data, isLoading, isFetching } = useGetAdhocQueryQuery(
    tableQuery || skipToken,
  );

  return {
    data,
    isLoading,
    isFetching,
    tableQuestion,
    tableQuery,
    getColumnSortDirection,
    handleTableQuestionChange,
    handleChangeColumnSort,
  };
}

const getQueryColumn = (question: Question, columnOrField: DatasetColumn) => {
  const query = question.query();
  const stageIndex = -1;
  const column = Lib.findMatchingColumn(
    query,
    stageIndex,
    Lib.fromLegacyColumn(query, stageIndex, columnOrField),
    Lib.orderableColumns(query, stageIndex),
  );

  return {
    query,
    stageIndex,
    column,
  };
};
