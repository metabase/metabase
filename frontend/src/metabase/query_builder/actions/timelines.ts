import { createAction } from "redux-actions";

import type { Dispatch, GetState } from "metabase/redux/store";
import { getTransformedTimelines } from "metabase/timelines/panel/selectors";
import { isSameTimelineEventsVisibility } from "metabase/visualizations/lib/timeline-events-visibility";
import type { TimelineEventsVisibilityUpdate } from "metabase/visualizations/types";

import {
  DESELECT_TIMELINE_EVENTS,
  SELECT_TIMELINE_EVENTS,
} from "../store/actions";
import { getTimelineEventsVisibility } from "../store/selectors";

import { onUpdateVisualizationSettings } from "./visualization-settings";

export const selectTimelineEvents = createAction(SELECT_TIMELINE_EVENTS);
export const deselectTimelineEvents = createAction(DESELECT_TIMELINE_EVENTS);

export const updateTimelineEventsVisibility =
  (update: TimelineEventsVisibilityUpdate) =>
  (dispatch: Dispatch, getState: GetState) => {
    const state = getState();
    const visibility = getTimelineEventsVisibility(state);
    const nextVisibility = update(visibility, getTransformedTimelines(state));

    if (!isSameTimelineEventsVisibility(visibility, nextVisibility)) {
      dispatch(onUpdateVisualizationSettings(nextVisibility));
    }
  };
