import { useCallback } from "react";

import type { Query } from "metabase-lib";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type FieldV1 from "metabase-lib/v1/metadata/Field";
import type { DatasetColumn, Field } from "metabase-types/api";

export const useTableSorting = ({
  question,
  handleQuestionChange,
}: {
  question: Question | undefined;
  handleQuestionChange?: (newQuestion: Question) => void;
}) => {
  const getColumnSortDirection = useCallback(
    (columnOrField: DatasetColumn | Field | FieldV1) => {
      if (!question || !columnOrField) {
        return;
      }

      const { query, stageIndex, column } = getQueryColumn(
        question,
        columnOrField,
      );

      if (column != null) {
        const columnInfo = Lib.displayInfo(query, stageIndex, column);
        if (columnInfo.orderByPosition != null) {
          const orderBys = Lib.orderBys(query, stageIndex);
          const orderBy = orderBys[columnInfo.orderByPosition];
          const orderByInfo = Lib.displayInfo(query, stageIndex, orderBy);
          return orderByInfo.direction;
        }
      }
    },
    [question],
  );

  const handleChangeColumnSort = useCallback(
    (field: Field) => {
      if (!question) {
        return;
      }

      const { query, stageIndex, column } = getQueryColumn(question, field);

      if (column) {
        const sortDirection = getColumnSortDirection(field);

        let newQuery: Query;
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

        const newQuestion = question.setQuery(newQuery);
        handleQuestionChange?.(newQuestion);
      }
    },
    [question, getColumnSortDirection, handleQuestionChange],
  );

  return { getColumnSortDirection, handleChangeColumnSort };
};

const getQueryColumn = (
  question: Question,
  columnOrField: DatasetColumn | Field | FieldV1,
) => {
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
