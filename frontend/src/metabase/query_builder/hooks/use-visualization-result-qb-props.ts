import { useCallback } from "react";

import { resetRowZoom, zoomInRow } from "metabase/query_builder/actions";
import {
  getIsShowingRawTable,
  getRowIndexToPKMap,
  getUiControls,
  getZoomedObjectId,
} from "metabase/query_builder/selectors";
import { useDispatch, useSelector } from "metabase/redux";

/**
 * Supplies the query-builder-specific props consumed by the shared
 * VisualizationResult component. These derive from query_builder redux state
 * and actions, which the shared `querying` module is not allowed to depend on,
 * so query_builder call sites inject them via props.
 */
export const useVisualizationResultQBProps = () => {
  const dispatch = useDispatch();
  const isRawTable = useSelector(getIsShowingRawTable);
  const scrollToLastColumn = useSelector(
    (state) => getUiControls(state)?.scrollToLastColumn ?? false,
  );
  const rowIndexToPkMap = useSelector(getRowIndexToPKMap);
  const zoomedObjectId = useSelector(getZoomedObjectId);

  const onZoomRow = useCallback(
    (rowIndex: number) => {
      const objectId = rowIndexToPkMap?.[rowIndex] ?? rowIndex;
      if (objectId === zoomedObjectId) {
        dispatch(resetRowZoom());
      } else {
        dispatch(zoomInRow({ objectId }));
      }
    },
    [dispatch, rowIndexToPkMap, zoomedObjectId],
  );

  const getExtraDataForClick = useCallback(() => ({ zoomInRow }), []);

  return { isRawTable, scrollToLastColumn, onZoomRow, getExtraDataForClick };
};
