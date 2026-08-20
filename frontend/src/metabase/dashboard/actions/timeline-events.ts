import { createAction } from "@reduxjs/toolkit";
import _ from "underscore";

import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { getDashCardById, getIsEditing } from "metabase/dashboard/selectors";
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
import { isDefaultVisibility } from "metabase/visualizations/lib/timeline-events-visibility";
import type { TimelineEventsVisibilityContext } from "metabase/visualizations/types";
import type { DashCardId, TimelineEventsVisibility } from "metabase-types/api";

import { setMultipleDashCardAttributes } from "./core";
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

    const changed = dashcardIds.flatMap(
      (dashcardId): [DashCardId, TimelineEventsVisibility][] => {
        const visibility =
          getDashCardTimelineEventsVisibility(state, dashcardId) ?? {};
        const nextVisibility = update(visibility, context);
        return _.isEqual(visibility, nextVisibility)
          ? []
          : [[dashcardId, nextVisibility]];
      },
    );

    if (changed.length === 0) {
      return;
    }

    if (getIsEditing(state)) {
      dispatch(
        setMultipleDashCardAttributes({
          dashcards: changed.map(([dashcardId, visibility]) => ({
            id: dashcardId,
            attributes: {
              visualization_settings: {
                ...getDashCardById(state, dashcardId)?.visualization_settings,
                "timeline_events.visibility": isDefaultVisibility(visibility)
                  ? undefined
                  : visibility,
              },
            },
          })),
        }),
      );
    } else {
      dispatch(
        setDashCardTimelineEventsVisibility(Object.fromEntries(changed)),
      );
    }
  };
