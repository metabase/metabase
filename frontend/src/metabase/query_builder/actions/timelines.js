import { createAction } from "redux-actions";

import { getFetchedTimelines } from "../selectors";

export const SHOW_TIMELINES = "metabase/qb/SHOW_TIMELINES";
export const showTimelines = createAction(SHOW_TIMELINES);

export const HIDE_TIMELINES = "metabase/qb/HIDE_TIMELINES";
export const hideTimelines = createAction(HIDE_TIMELINES);

export const SELECT_TIMELINE_EVENTS = "metabase/qb/SELECT_TIMELINE_EVENTS";
export const selectTimelineEvents = createAction(SELECT_TIMELINE_EVENTS);

export const DESELECT_TIMELINE_EVENTS = "metabase/qb/DESELECT_TIMELINE_EVENTS";
export const deselectTimelineEvents = createAction(DESELECT_TIMELINE_EVENTS);

export const INITIALIZE_VISIBLE_TIMELINE_EVENTS =
  "metabase/qb/INITIALIZE_VISIBLE_TIMELINE_EVENTS";
const initializeVisibleTimelineEvents = createAction(
  INITIALIZE_VISIBLE_TIMELINE_EVENTS,
);

export const HIDE_TIMELINE_EVENT = "metabase/qb/HIDE_TIMELINE_EVENT";
export const hideTimelineEvent = createAction(HIDE_TIMELINE_EVENT);

export const SHOW_TIMELINE_EVENT = "metabase/qb/SHOW_TIMELINE_EVENT";
export const showTimelineEvent = createAction(SHOW_TIMELINE_EVENT);

export const CREATE_TIMELINE_EVENT = "metabase/entities/timelineEvents/CREATE";

export const showTimelinesForCollection =
  collectionId => (dispatch, getState) => {
    const fetchedTimelines = getFetchedTimelines(getState());
    const collectionTimelines = collectionId
      ? fetchedTimelines.filter(t => t.collection_id === collectionId)
      : fetchedTimelines.filter(t => t.collection_id == null);

    dispatch(showTimelines(collectionTimelines));
    dispatch(
      initializeVisibleTimelineEvents(
        collectionTimelines.flatMap(t => t.events),
      ),
    );
  };
