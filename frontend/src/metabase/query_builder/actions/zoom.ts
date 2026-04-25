import { ZOOM_IN_ROW } from "metabase/redux/query-builder";
import type { Dispatch, GetState } from "metabase/redux/store";
import type { ObjectId } from "metabase/visualizations/components/ObjectDetail/types";

import { getPKColumnIndex } from "../selectors";

import { updateUrl } from "./url";

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
