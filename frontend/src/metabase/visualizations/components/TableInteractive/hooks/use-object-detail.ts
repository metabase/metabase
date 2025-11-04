import { useCallback, useMemo } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { resetRowZoom, zoomInRow } from "metabase/query_builder/actions";
import {
  getRowIndexToPKMap,
  getZoomedObjectId,
} from "metabase/query_builder/selectors";
import type { ObjectId } from "metabase/visualizations/components/ObjectDetail/types";
import type { ColumnDescriptor } from "metabase/visualizations/lib/graph/columns";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetData } from "metabase-types/api";
import type { State } from "metabase-types/store";

const getZoomedObjectIdSafe = (state: State) => {
  return state.qb ? getZoomedObjectId(state) : undefined;
};

export const useObjectDetail = ({ rows, cols }: DatasetData) => {
  const dispatch = useDispatch();
  const zoomedObjectId = useSelector(getZoomedObjectIdSafe);
  const rowIndexToPkMap: Record<number, ObjectId> = useSelector((state) =>
    state.qb != null ? getRowIndexToPKMap(state) : {},
  );

  const primaryKeyColumn: ColumnDescriptor | null = useMemo(() => {
    const primaryKeyColumns = cols.filter(isPK);

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
      let objectId: number | string;

      if (primaryKeyColumn) {
        const value = rows[rowIndex][primaryKeyColumn.index];
        objectId =
          typeof value === "number" || typeof value === "string"
            ? value
            : rowIndex;
      } else {
        objectId = rowIndexToPkMap?.[rowIndex] ?? rowIndex;
      }

      if (objectId === zoomedObjectId) {
        dispatch(resetRowZoom());
      } else {
        dispatch(zoomInRow({ objectId }));
      }
    },
    [dispatch, primaryKeyColumn, rowIndexToPkMap, rows, zoomedObjectId],
  );

  return onOpenObjectDetail;
};
