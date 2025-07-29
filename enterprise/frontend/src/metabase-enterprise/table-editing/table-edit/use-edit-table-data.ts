import type { Location } from "history";
import { useCallback } from "react";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import type { OrderByDirection, Query } from "metabase-lib";
import {
  changeDirection,
  displayInfo,
  findMatchingColumn,
  fromLegacyColumn,
  orderBy,
  orderBys,
  orderableColumns,
  removeOrderBys,
} from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatasetColumn } from "metabase-types/api";

import { useAdHocTableQuery } from "./use-adhoc-table-query";

type Props = {
  tableId: number;
  databaseId: number;
  location: Location<{ filter?: string }>;
};

export type TableDataGetColumnSortDirection = (
  column: DatasetColumn,
) => OrderByDirection | undefined;

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
        const columnInfo = displayInfo(query, stageIndex, column);
        if (columnInfo.orderByPosition != null) {
          const orderBysMap = orderBys(query, stageIndex);
          const orderBy = orderBysMap[columnInfo.orderByPosition];
          const orderByInfo = displayInfo(query, stageIndex, orderBy);
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

        let newQuery: Query;
        if (sortDirection === "asc") {
          // have existing sorting by asc, then make it desc
          const clauses = orderBys(query, stageIndex);
          newQuery = changeDirection(query, clauses[0]);
        } else if (sortDirection === "desc") {
          // have existing sorting by desc, then remove sorting - WRK-446
          newQuery = removeOrderBys(query, stageIndex);
        } else {
          // no existing sorting on this column - apply new sorting (default - by asc)
          newQuery = orderBy(
            removeOrderBys(query, stageIndex),
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
  const column = findMatchingColumn(
    query,
    stageIndex,
    fromLegacyColumn(query, stageIndex, columnOrField),
    orderableColumns(query, stageIndex),
  );

  return {
    query,
    stageIndex,
    column,
  };
};
