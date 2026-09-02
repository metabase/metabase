import {
  createSelector,
  createSelectorCreator,
  lruMemoize,
} from "@reduxjs/toolkit";
import { createCachedSelector } from "re-reselect";
import { shallowEqual } from "react-redux";

import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import {
  getCurrentDashcards,
  getDashCardById,
  getDashboard,
  getDashcardData,
  getDashcardDataMap,
  getDashcards,
  getSidebar,
} from "metabase/dashboard/selectors";
import type {
  DashboardState,
  DashboardTimelineEventsState,
  State,
} from "metabase/redux/store";
import { getTransformedTimelines } from "metabase/timelines/panel/selectors";
import {
  aggregateVisibleEventIds,
  getRecordedTimelineEventsVisibility,
  resolveVisibleTimelineEvents,
} from "metabase/visualizations/lib/timeline-events-visibility";
import type {
  DashCardId,
  TimelineEvent,
  TimelineEventId,
  TimelineEventsVisibility,
} from "metabase-types/api";

import {
  canDashCardDisplayTimelineEvents,
  computeDashCardTimeseriesXAxis,
  isDashCardDataLoaded,
} from "./utils";

const NO_EVENTS: TimelineEvent[] = [];
const NO_EVENT_IDS: TimelineEventId[] = [];

const createShallowEqualResultSelector = createSelectorCreator({
  memoize: lruMemoize,
  memoizeOptions: { resultEqualityCheck: shallowEqual },
});

export const getDashboardCollectionId = (state: State) =>
  getDashboard(state)?.collection_id ?? null;

const getTimelineEventsOverrides = (state: State) =>
  state.dashboard.timelineEvents.overrides;

const resolveDashCardVisibility = (
  overrides: DashboardTimelineEventsState["overrides"],
  dashcards: DashboardState["dashcards"],
  dashcardId: DashCardId,
): TimelineEventsVisibility | undefined =>
  overrides[dashcardId] ??
  getRecordedTimelineEventsVisibility(
    dashcards[dashcardId]?.card?.visualization_settings,
  );

export const getDashCardTimelineEventsVisibility = (
  state: State,
  dashcardId: DashCardId,
): TimelineEventsVisibility | undefined =>
  resolveDashCardVisibility(
    getTimelineEventsOverrides(state),
    getDashcards(state),
    dashcardId,
  );

export const getDashCardTimeseriesXAxis = createCachedSelector(
  [getDashCardById, getDashcardData],
  (dashcard, dashcardData) =>
    dashcard ? computeDashCardTimeseriesXAxis(dashcard, dashcardData) : null,
)((_state, dashcardId) => dashcardId);

export const getIsTimelineEventsDashCard = createCachedSelector(
  [getDashCardById, getDashCardTimeseriesXAxis],
  (dashcard, xAxis) =>
    dashcard != null &&
    canDashCardDisplayTimelineEvents(dashcard) &&
    xAxis != null,
)((_state, dashcardId) => dashcardId);

export const getDashCardVisibleTimelineEvents = createCachedSelector(
  [getTransformedTimelines, getDashCardTimelineEventsVisibility],
  (timelines, visibility): TimelineEvent[] => {
    const events = resolveVisibleTimelineEvents({ timelines, visibility });
    return events.length > 0 ? events : NO_EVENTS;
  },
)({
  keySelector: (_state, dashcardId) => dashcardId,
  selectorCreator: createShallowEqualResultSelector,
});

export const getDashCardSelectedTimelineEventIds = (
  state: State,
  dashcardId?: DashCardId,
): TimelineEventId[] => {
  if (getSidebar(state).name !== SIDEBAR_NAME.events) {
    return NO_EVENT_IDS;
  }
  const selection = state.dashboard.timelineEvents.selection;
  return selection &&
    (selection.dashcardId == null || selection.dashcardId === dashcardId)
    ? selection.eventIds
    : NO_EVENT_IDS;
};

export const getTimelineEventsDashCardIds = createShallowEqualResultSelector(
  [getCurrentDashcards, getDashcardDataMap, (state: State) => state],
  (dashcards, dashcardDataMap, state) =>
    dashcards
      .filter(
        (dashcard) =>
          canDashCardDisplayTimelineEvents(dashcard) &&
          (!isDashCardDataLoaded(dashcard, dashcardDataMap[dashcard.id]) ||
            getIsTimelineEventsDashCard(state, dashcard.id)),
      )
      .map((dashcard) => dashcard.id),
);

export const getDashboardTimelineEventsAggregate = createSelector(
  [
    getTimelineEventsDashCardIds,
    getTransformedTimelines,
    getTimelineEventsOverrides,
    getDashcards,
  ],
  (dashcardIds, timelines, overrides, dashcards) =>
    aggregateVisibleEventIds(
      dashcardIds.map((dashcardId) =>
        resolveVisibleTimelineEvents({
          timelines,
          visibility: resolveDashCardVisibility(
            overrides,
            dashcards,
            dashcardId,
          ),
        }).map((event) => event.id),
      ),
    ),
);
