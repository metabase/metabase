import { createAction } from "redux-actions";

import type { Dispatch, GetState } from "metabase/redux/store";
import { getTimelineEventSettings } from "metabase/visualizations/lib/settings/timelineEvents";
import type { CollectionId, Timeline, TimelineEvent } from "metabase-types/api";

import {
  getFetchedTimelines,
  getQuestion,
  getTransformedTimelines,
  getVisibleTimelineEventIds,
} from "../selectors";

import { onUpdateVisualizationSettings } from "./visualization-settings";

export const SELECT_TIMELINE_EVENTS = "metabase/qb/SELECT_TIMELINE_EVENTS";
export const selectTimelineEvents = createAction(SELECT_TIMELINE_EVENTS);

export const DESELECT_TIMELINE_EVENTS = "metabase/qb/DESELECT_TIMELINE_EVENTS";
export const deselectTimelineEvents = createAction(DESELECT_TIMELINE_EVENTS);

export const HIDE_TIMELINE_EVENTS = "metabase/qb/HIDE_TIMELINE_EVENTS";
const hideTimelineEventsAction = createAction(HIDE_TIMELINE_EVENTS);

export const SHOW_TIMELINE_EVENTS = "metabase/qb/SHOW_TIMELINE_EVENTS";
const showTimelineEventsAction = createAction(SHOW_TIMELINE_EVENTS);

export const showTimelineEvents =
  (events: TimelineEvent[]) => (dispatch: Dispatch) => {
    dispatch(showTimelineEventsAction(events));
    dispatch(persistTimelineVisibility());
  };

export const hideTimelineEvents =
  (events: TimelineEvent[]) => (dispatch: Dispatch) => {
    dispatch(hideTimelineEventsAction(events));
    dispatch(persistTimelineVisibility());
  };

// Saves the current selection to the question's visualization settings so
// that dashboards (and future query builder sessions) can restore it.
const persistTimelineVisibility =
  () => (dispatch: Dispatch, getState: GetState) => {
    const timelines = getTransformedTimelines(getState());
    const visibleEventIds = getVisibleTimelineEventIds(getState());
    dispatch(
      onUpdateVisualizationSettings(
        getTimelineEventSettings(timelines, visibleEventIds),
      ),
    );
  };

export const showTimelinesForCollection =
  (collectionId?: CollectionId | null) =>
  (dispatch: Dispatch, getState: GetState) => {
    const fetchedTimelines: Timeline[] = getFetchedTimelines(getState());
    const collectionTimelines = collectionId
      ? fetchedTimelines.filter((t) => t.collection_id === collectionId)
      : fetchedTimelines.filter((t) => t.collection_id == null);

    dispatch(
      showTimelineEventsAction(collectionTimelines.flatMap((t) => t.events)),
    );
  };

// Initial visibility: the selection saved on the question wins; questions
// without one default to the events of their collection's timelines.
export const initializeTimelineVisibility =
  (collectionId?: CollectionId | null) =>
  (dispatch: Dispatch, getState: GetState) => {
    const settings = getQuestion(getState())?.settings();
    const selectedTimelineIds = settings?.["timeline.selected_timeline_ids"];

    if (selectedTimelineIds == null) {
      dispatch(showTimelinesForCollection(collectionId));
      return;
    }

    const selectedSet = new Set(selectedTimelineIds);
    const excludedSet = new Set(
      settings?.["timeline.excluded_timeline_event_ids"] ?? [],
    );
    const events = getFetchedTimelines(getState())
      .filter((timeline) => selectedSet.has(timeline.id))
      .flatMap((timeline) => timeline.events ?? [])
      .filter((event) => !excludedSet.has(event.id));

    dispatch(showTimelineEventsAction(events));
  };
