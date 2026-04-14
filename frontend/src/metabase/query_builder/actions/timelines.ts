import { createAction } from "redux-actions";

import type { Dispatch, GetState } from "metabase/redux/store";
import type { CollectionId, Timeline } from "metabase-types/api";

import { getFetchedTimelines } from "../selectors";

export const SELECT_TIMELINE_EVENTS = "metabase/qb/SELECT_TIMELINE_EVENTS";
export const selectTimelineEvents = createAction(SELECT_TIMELINE_EVENTS);

export const DESELECT_TIMELINE_EVENTS = "metabase/qb/DESELECT_TIMELINE_EVENTS";
export const deselectTimelineEvents = createAction(DESELECT_TIMELINE_EVENTS);

export const HIDE_TIMELINE_EVENTS = "metabase/qb/HIDE_TIMELINE_EVENTS";
export const hideTimelineEvents = createAction(HIDE_TIMELINE_EVENTS);

export const SHOW_TIMELINE_EVENTS = "metabase/qb/SHOW_TIMELINE_EVENTS";
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
