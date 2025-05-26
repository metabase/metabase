import { useCallback } from "react";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type Field from "metabase-lib/v1/metadata/Field";
import type { DatasetColumn } from "metabase-types/api";

export const useTableSorting = ({ question }: { question: Question }) => {
  const getColumnSortDirection = useCallback(
    (columnOrField: DatasetColumn | Field) => {
      if (!question || !columnOrField) {
        return;
      }

      const query = question.query();
      const stageIndex = -1;
      const column = Lib.findMatchingColumn(
        query,
        stageIndex,
        Lib.fromLegacyColumn(query, stageIndex, columnOrField),
        Lib.orderableColumns(query, stageIndex),
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

  return { getColumnSortDirection };
};
