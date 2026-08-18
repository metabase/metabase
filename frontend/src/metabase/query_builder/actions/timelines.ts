import { createAction } from "redux-actions";

import type { Dispatch, GetState } from "metabase/redux/store";
import { getCollectionTimelines } from "metabase/visualizations/lib/timeline-events-visibility";
import type { CollectionId } from "metabase-types/api";

import {
  DESELECT_TIMELINE_EVENTS,
  HIDE_TIMELINE_EVENTS,
  SELECT_TIMELINE_EVENTS,
  SHOW_TIMELINE_EVENTS,
} from "../store/actions";
import { getFetchedTimelines } from "../store/selectors";

export const selectTimelineEvents = createAction(SELECT_TIMELINE_EVENTS);
export const deselectTimelineEvents = createAction(DESELECT_TIMELINE_EVENTS);
export const hideTimelineEvents = createAction(HIDE_TIMELINE_EVENTS);
export const showTimelineEvents = createAction(SHOW_TIMELINE_EVENTS);

export const showTimelinesForCollection =
  (collectionId?: CollectionId | null) =>
  (dispatch: Dispatch, getState: GetState) => {
    const collectionTimelines = getCollectionTimelines(
      getFetchedTimelines(getState()),
      collectionId,
    );
    dispatch(showTimelineEvents(collectionTimelines.flatMap((t) => t.events)));
  };
