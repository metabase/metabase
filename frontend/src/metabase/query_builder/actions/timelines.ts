import { createAction } from "redux-actions";

import type { Dispatch, GetState } from "metabase/redux/store";
import { getTransformedTimelines } from "metabase/timelines/panel/selectors";
import { isSameTimelineEventsVisibility } from "metabase/visualizations/lib/timeline-events-visibility";
import type { TimelineEventsVisibilityUpdate } from "metabase/visualizations/types";
import type { TimelineEventId } from "metabase-types/api";

import {
  type QuestionEventsPanelLocation,
  trackQuestionEventsPanelOpened,
} from "../analytics";
import {
  DESELECT_TIMELINE_EVENTS,
  SELECT_TIMELINE_EVENTS,
  onOpenTimelines,
} from "../store/actions";
import { getTimelineEventsVisibility, getUiControls } from "../store/selectors";

import { onUpdateVisualizationSettings } from "./visualization-settings";

export const selectTimelineEvents = createAction(SELECT_TIMELINE_EVENTS);
export const deselectTimelineEvents = createAction(DESELECT_TIMELINE_EVENTS);

export const openTimelines =
  (location: QuestionEventsPanelLocation, eventIds?: TimelineEventId[]) =>
  (dispatch: Dispatch, getState: GetState) => {
    if (!getUiControls(getState()).isShowingTimelineSidebar) {
      trackQuestionEventsPanelOpened(location);
    }
    dispatch(onOpenTimelines(eventIds));
  };

export const openTimelinesFromChart = (eventIds?: TimelineEventId[]) =>
  openTimelines("chart", eventIds);

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
