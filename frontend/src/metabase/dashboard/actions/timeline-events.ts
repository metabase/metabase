import { createAction } from "@reduxjs/toolkit";

import {
  type DashboardEventsPanelLocation,
  type DashboardEventsVisibilityLocation,
  trackDashboardEventsPanelOpened,
  trackDashboardEventsShown,
  trackDashboardEventsVisibilityChanged,
} from "metabase/dashboard/analytics";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { getDashboard } from "metabase/dashboard/selectors";
import { getDashCardTimelineEventsVisibility } from "metabase/dashboard/timeline-events/selectors";
import type {
  Dispatch,
  EventsSidebarProps,
  GetState,
  TimelineEventsSelection,
} from "metabase/redux/store";
import { getTransformedTimelines } from "metabase/timelines/panel/selectors";
import {
  isSameTimelineEventsVisibility,
  resolveVisibleTimelineEvents,
} from "metabase/visualizations/lib/timeline-events-visibility";
import type { TimelineEventsVisibilityUpdate } from "metabase/visualizations/types";
import type { DashCardId, TimelineEventsVisibility } from "metabase-types/api";

import { setSidebar } from "./ui";

export const setDashCardTimelineEventsVisibility = createAction<
  Record<DashCardId, TimelineEventsVisibility>
>("metabase/dashboard/SET_DASHCARD_TIMELINE_EVENTS_VISIBILITY");

export const selectTimelineEvents = createAction<TimelineEventsSelection>(
  "metabase/dashboard/SELECT_TIMELINE_EVENTS",
);

export const deselectTimelineEvents = createAction(
  "metabase/dashboard/DESELECT_TIMELINE_EVENTS",
);

export const markTimelineEventsShown = createAction(
  "metabase/dashboard/MARK_TIMELINE_EVENTS_SHOWN",
);

export const trackTimelineEventsShown =
  () => (dispatch: Dispatch, getState: GetState) => {
    const state = getState();
    const dashboardId = getDashboard(state)?.id;
    if (
      dashboardId == null ||
      state.dashboard.timelineEvents.hasTrackedEventsShown
    ) {
      return;
    }
    dispatch(markTimelineEventsShown());
    trackDashboardEventsShown(dashboardId);
  };

export const openEventsSidebar =
  (props: EventsSidebarProps = {}, location?: DashboardEventsPanelLocation) =>
  (dispatch: Dispatch, getState: GetState) => {
    const state = getState();
    const wasOpen = state.dashboard.sidebar.name === SIDEBAR_NAME.events;
    dispatch(setSidebar({ name: SIDEBAR_NAME.events, props }));
    if (location && !wasOpen) {
      trackDashboardEventsPanelOpened(getDashboard(state)?.id, location);
    }
  };

type VisibilityChange = {
  dashcardId: DashCardId;
  visibility: TimelineEventsVisibility;
  nextVisibility: TimelineEventsVisibility;
};

export const updateDashCardsTimelineEventsVisibility =
  (
    dashcardIds: DashCardId[],
    update: TimelineEventsVisibilityUpdate,
    location: DashboardEventsVisibilityLocation,
  ) =>
  (dispatch: Dispatch, getState: GetState) => {
    const state = getState();
    const timelines = getTransformedTimelines(state);

    const changes = dashcardIds.flatMap((dashcardId): VisibilityChange[] => {
      const visibility =
        getDashCardTimelineEventsVisibility(state, dashcardId) ?? {};
      const nextVisibility = update(visibility, timelines);
      return isSameTimelineEventsVisibility(visibility, nextVisibility)
        ? []
        : [{ dashcardId, visibility, nextVisibility }];
    });

    if (changes.length === 0) {
      return;
    }

    dispatch(
      setDashCardTimelineEventsVisibility(
        Object.fromEntries(
          changes.map(({ dashcardId, nextVisibility }) => [
            dashcardId,
            nextVisibility,
          ]),
        ),
      ),
    );

    const countVisible = (visibility: TimelineEventsVisibility) =>
      resolveVisibleTimelineEvents({ timelines, visibility }).length;
    const shownDelta = changes.reduce(
      (delta, { visibility, nextVisibility }) =>
        delta + countVisible(nextVisibility) - countVisible(visibility),
      0,
    );
    trackDashboardEventsVisibilityChanged(
      getDashboard(state)?.id,
      location,
      shownDelta > 0 ? "shown" : "hidden",
    );
  };
