import { createAction } from "redux-actions";

import type { Dispatch, GetState } from "metabase/redux/store";
import type { CollectionId, Timeline } from "metabase-types/api";

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
    const fetchedTimelines: Timeline[] = getFetchedTimelines(getState());
    const collectionTimelines = collectionId
      ? fetchedTimelines.filter((t) => t.collection_id === collectionId)
      : fetchedTimelines.filter((t) => t.collection_id == null);

    dispatch(showTimelineEvents(collectionTimelines.flatMap((t) => t.events)));
  };
