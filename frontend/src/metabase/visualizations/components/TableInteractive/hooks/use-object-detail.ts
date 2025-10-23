import { useCallback } from "react";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { resetRowZoom, zoomInRow } from "metabase/query_builder/actions";
import {
  getPKColumnIndex,
  getQueryResults,
  getRowIndexToPKMap,
  getZoomedObjectId,
} from "metabase/query_builder/selectors";
import type { ObjectId } from "metabase/visualizations/components/ObjectDetail/types";
import type { State } from "metabase-types/store";

const getZoomedObjectIdSafe = (state: State) => {
  return state.qb ? getZoomedObjectId(state) : undefined;
};

export const useObjectDetail = () => {
  const dispatch = useDispatch();
  const zoomedObjectId = useSelector(getZoomedObjectIdSafe);
  const rowIndexToPkMap: Record<number, ObjectId> = useSelector((state) =>
    state.qb != null ? getRowIndexToPKMap(state) : {},
  );

  const pkIndex = useSelector(getPKColumnIndex);
  const queryResults = useSelector(getQueryResults);

  const onOpenObjectDetail = useCallback(
    (rowIndex: number) => {
      const rows = queryResults?.[0]?.data?.rows || [];
      let objectId: number | string;

      if (pkIndex > -1) {
        const value = rows[rowIndex][pkIndex];
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
    [dispatch, pkIndex, rowIndexToPkMap, queryResults, zoomedObjectId],
  );

  return onOpenObjectDetail;
};
