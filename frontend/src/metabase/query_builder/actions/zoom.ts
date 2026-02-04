import type { ObjectId } from "metabase/visualizations/components/ObjectDetail/types";
import type { Dispatch, GetState } from "metabase-types/store";

import { getPKColumnIndex } from "../selectors";

import { updateUrl } from "./url";

export const ZOOM_IN_ROW = "metabase/qb/ZOOM_IN_ROW";
export const zoomInRow =
  ({ objectId }: { objectId: ObjectId }) =>
  (dispatch: Dispatch, getState: GetState) => {
    dispatch({ type: ZOOM_IN_ROW, payload: { objectId } });

    // don't show object id in url if it is a row index
    const hasPK = getPKColumnIndex(getState()) !== -1;
    if (hasPK) {
      dispatch(updateUrl(null, { objectId, replaceState: false }));
    }
  };
