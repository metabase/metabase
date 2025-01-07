import { useCallback, useMemo } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { zoomInRow } from "metabase/query_builder/actions";
import { getRowIndexToPKMap } from "metabase/query_builder/selectors";
import type { ColumnDescriptor } from "metabase/visualizations/lib/graph/columns";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetData } from "metabase-types/api";

export const useObjectDetail = ({ cols, rows }: DatasetData) => {
  const dispatch = useDispatch();
  const rowIndexToPkMap = useSelector(getRowIndexToPKMap);

  const primaryKeyColumn: ColumnDescriptor | null = useMemo(() => {
    const primaryKeyColumns = cols.filter(isPK);

    // As of now, we support object detail drill on datasets with single column PK
    if (primaryKeyColumns.length !== 1) {
      return null;
    }
    const primaryKeyColumn = primaryKeyColumns[0];

    return {
      column: primaryKeyColumn,
      index: cols.indexOf(primaryKeyColumn),
    };
  }, [cols]);

  const onOpenObjectDetail = useCallback(
    (rowIndex: number) => {
      let objectId;

      if (primaryKeyColumn) {
        objectId = rows[rowIndex][primaryKeyColumn.index];
      } else {
        objectId = rowIndexToPkMap[rowIndex] ?? rowIndex;
      }

      dispatch(zoomInRow({ objectId }));
    },
    [dispatch, primaryKeyColumn, rowIndexToPkMap, rows],
  );

  return onOpenObjectDetail;
};
