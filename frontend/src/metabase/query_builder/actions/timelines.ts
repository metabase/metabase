import { createAction } from "redux-actions";

import {
  DESELECT_TIMELINE_EVENTS,
  SELECT_TIMELINE_EVENTS,
} from "metabase/redux/query-builder";
import type { Dispatch, GetState } from "metabase/redux/store";
import { getTimelineEventsVisibilityContext } from "metabase/timelines/panel/selectors";
import {
  hideTimelineEvents as hideEventsInVisibility,
  hideTimelines as hideTimelinesInVisibility,
  showTimelineEvents as showEventsInVisibility,
  showTimelines as showTimelinesInVisibility,
} from "metabase/visualizations/lib/timeline-events-visibility";
import type { TimelineEventsVisibilityUpdate } from "metabase/visualizations/types";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import { getTimelineEventsVisibility } from "../selectors";

import { onUpdateVisualizationSettings } from "./visualization-settings";

export const selectTimelineEvents = createAction(SELECT_TIMELINE_EVENTS);
export const deselectTimelineEvents = createAction(DESELECT_TIMELINE_EVENTS);

const updateTimelineEventsVisibility =
  (update: TimelineEventsVisibilityUpdate) =>
  (dispatch: Dispatch, getState: GetState) => {
    const state = getState();
    const visibility = update(
      getTimelineEventsVisibility(state),
      getTimelineEventsVisibilityContext(state),
    );
    dispatch(onUpdateVisualizationSettings(visibility));
  };

export const showTimelineEvents = (events: TimelineEvent[]) =>
  updateTimelineEventsVisibility((visibility, context) =>
    showEventsInVisibility(visibility, events, context),
  );

export const hideTimelineEvents = (events: TimelineEvent[]) =>
  updateTimelineEventsVisibility((visibility, context) =>
    hideEventsInVisibility(visibility, events, context),
  );

export const showTimeline = (timeline: Timeline) =>
  updateTimelineEventsVisibility((visibility, context) =>
    showTimelinesInVisibility(visibility, [timeline], context),
  );

export const hideTimeline = (timeline: Timeline) =>
  updateTimelineEventsVisibility((visibility, context) =>
    hideTimelinesInVisibility(visibility, [timeline], context),
  );
