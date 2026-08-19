import { createAction } from "@reduxjs/toolkit";

import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import {
  getDashCardTimelineEventsVisibility,
  getTimelineEventsVisibilityContext,
} from "metabase/dashboard/timeline-events/selectors";
import type {
  Dispatch,
  EventsSidebarProps,
  GetState,
  TimelineEventsSelection,
} from "metabase/redux/store";
import type { TimelineEventsVisibilityContext } from "metabase/visualizations/types";
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

export const openEventsSidebar = (props: EventsSidebarProps = {}) =>
  setSidebar({ name: SIDEBAR_NAME.events, props });

export type TimelineEventsVisibilityUpdate = (
  visibility: TimelineEventsVisibility,
  context: TimelineEventsVisibilityContext,
) => TimelineEventsVisibility;

export const updateDashCardsTimelineEventsVisibility =
  (dashcardIds: DashCardId[], update: TimelineEventsVisibilityUpdate) =>
  (dispatch: Dispatch, getState: GetState) => {
    const state = getState();
    const context = getTimelineEventsVisibilityContext(state);
    dispatch(
      setDashCardTimelineEventsVisibility(
        Object.fromEntries(
          dashcardIds.map((dashcardId) => [
            dashcardId,
            update(
              getDashCardTimelineEventsVisibility(state, dashcardId) ?? {},
              context,
            ),
          ]),
        ),
      ),
    );
  };
