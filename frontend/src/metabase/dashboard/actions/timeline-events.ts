import { createAction } from "@reduxjs/toolkit";
import _ from "underscore";

import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { getDashCardById, getIsEditing } from "metabase/dashboard/selectors";
import {
  getCollectionTimelinesVisibility,
  getDashCardTimelineEventsVisibility,
  getTimelineEventsDashCardIds,
  getTimelineEventsVisibilityContext,
} from "metabase/dashboard/timeline-events/selectors";
import type {
  Dispatch,
  EventsSidebarProps,
  GetState,
  State,
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

export const openEventsSidebar =
  (props: EventsSidebarProps = {}) =>
  (dispatch: Dispatch, getState: GetState) => {
    const state = getState();
    const seed = getCollectionTimelinesVisibility(state);
    if (!isDefaultVisibility(seed)) {
      const dashcardIds =
        props.dashcardId != null
          ? [props.dashcardId]
          : getTimelineEventsDashCardIds(state);
      const unconfiguredIds = dashcardIds.filter(
        (dashcardId) =>
          getDashCardTimelineEventsVisibility(state, dashcardId) == null,
      );
      if (unconfiguredIds.length > 0) {
        dispatch(
          setDashCardTimelineEventsVisibility(
            Object.fromEntries(
              unconfiguredIds.map((dashcardId) => [dashcardId, seed]),
            ),
          ),
        );
      }
    }
    dispatch(setSidebar({ name: SIDEBAR_NAME.events, props }));
  };

export type TimelineEventsVisibilityUpdate = (
  visibility: TimelineEventsVisibility,
  context: TimelineEventsVisibilityContext,
) => TimelineEventsVisibility;

type DashCardVisibility = {
  dashcardId: DashCardId;
  visibility: TimelineEventsVisibility;
};

const getUpdatedVisibilities = (
  state: State,
  dashcardIds: DashCardId[],
  update: TimelineEventsVisibilityUpdate,
): DashCardVisibility[] => {
  const context = getTimelineEventsVisibilityContext(state);
  return dashcardIds.flatMap((dashcardId) => {
    const visibility =
      getDashCardTimelineEventsVisibility(state, dashcardId) ?? {};
    const nextVisibility = update(visibility, context);
    return _.isEqual(visibility, nextVisibility)
      ? []
      : [{ dashcardId, visibility: nextVisibility }];
  });
};

const persistVisibilities = (
  state: State,
  visibilities: DashCardVisibility[],
) =>
  setMultipleDashCardAttributes({
    dashcards: visibilities.map(({ dashcardId, visibility }) => ({
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
  });

const overrideVisibilities = (visibilities: DashCardVisibility[]) =>
  setDashCardTimelineEventsVisibility(
    Object.fromEntries(
      visibilities.map(({ dashcardId, visibility }) => [
        dashcardId,
        visibility,
      ]),
    ),
  );

export const updateDashCardsTimelineEventsVisibility =
  (dashcardIds: DashCardId[], update: TimelineEventsVisibilityUpdate) =>
  (dispatch: Dispatch, getState: GetState) => {
    const state = getState();
    const visibilities = getUpdatedVisibilities(state, dashcardIds, update);

    if (visibilities.length === 0) {
      return;
    }

    dispatch(
      getIsEditing(state)
        ? persistVisibilities(state, visibilities)
        : overrideVisibilities(visibilities),
    );
  };
