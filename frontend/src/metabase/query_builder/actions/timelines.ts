import { createAction } from "redux-actions";

import type { Dispatch, GetState } from "metabase/redux/store";
import { getTransformedTimelines } from "metabase/timelines/panel/selectors";
import {
  hideTimelineEvents as hideEventsInVisibility,
  hideTimelines as hideTimelinesInVisibility,
  showTimelineEvents as showEventsInVisibility,
  showTimelines as showTimelinesInVisibility,
} from "metabase/visualizations/lib/timeline-events-visibility";
import type { TimelineEventsVisibilityUpdate } from "metabase/visualizations/types";
import type { Timeline, TimelineEvent } from "metabase-types/api";

import {
  DESELECT_TIMELINE_EVENTS,
  SELECT_TIMELINE_EVENTS,
} from "../store/actions";
import { getTimelineEventsVisibility } from "../store/selectors";

import { onUpdateVisualizationSettings } from "./visualization-settings";

export const selectTimelineEvents = createAction(SELECT_TIMELINE_EVENTS);
export const deselectTimelineEvents = createAction(DESELECT_TIMELINE_EVENTS);

const updateTimelineEventsVisibility =
  (update: TimelineEventsVisibilityUpdate) =>
  (dispatch: Dispatch, getState: GetState) => {
    const state = getState();
    const visibility = update(
      getTimelineEventsVisibility(state),
      getTransformedTimelines(state),
    );
    dispatch(onUpdateVisualizationSettings(visibility));
  };

export const showTimelineEvents = (events: TimelineEvent[]) =>
  updateTimelineEventsVisibility((visibility, timelines) =>
    showEventsInVisibility(visibility, events, timelines),
  );

export const hideTimelineEvents = (events: TimelineEvent[]) =>
  updateTimelineEventsVisibility((visibility, timelines) =>
    hideEventsInVisibility(visibility, events, timelines),
  );

export const showTimeline = (timeline: Timeline) =>
  updateTimelineEventsVisibility((visibility, timelines) =>
    showTimelinesInVisibility(visibility, [timeline.id], timelines),
  );

export const hideTimeline = (timeline: Timeline) =>
  updateTimelineEventsVisibility((visibility, timelines) =>
    hideTimelinesInVisibility(visibility, [timeline.id], timelines),
  );
