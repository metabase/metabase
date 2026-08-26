import {
  createSelector,
  createSelectorCreator,
  lruMemoize,
} from "@reduxjs/toolkit";
import { createCachedSelector } from "re-reselect";
import { shallowEqual } from "react-redux";

import {
  getCurrentDashcards,
  getDashboard,
  getDashcardData,
  getDashcardDataMap,
  getDashcards,
} from "metabase/dashboard/selectors";
import type {
  DashboardState,
  DashboardTimelineEventsState,
  State,
} from "metabase/redux/store";
import { getTimelineEventsVisibilityContext } from "metabase/timelines/panel/selectors";
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
} from "./utils";

const NO_EVENTS: TimelineEvent[] = [];
const NO_EVENT_IDS: TimelineEventId[] = [];

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
  [
    (state: State, dashcardId: DashCardId) => getDashcards(state)[dashcardId],
    (state: State, dashcardId: DashCardId) =>
      getDashcardData(state, dashcardId),
  ],
  (dashcard, dashcardData) =>
    dashcard ? computeDashCardTimeseriesXAxis(dashcard, dashcardData) : null,
)((_state, dashcardId) => dashcardId);

// Events only render on a time series axis, so a categorical cartesian chart
// must not offer the events UI.
export const getIsTimelineEventsDashCard = (
  state: State,
  dashcardId: DashCardId,
) => {
  const dashcard = getDashcards(state)[dashcardId];
  return (
    dashcard != null &&
    canDashCardDisplayTimelineEvents(dashcard) &&
    getDashCardTimeseriesXAxis(state, dashcardId) != null
  );
};

const createStableEventsSelector = createSelectorCreator({
  memoize: lruMemoize,
  memoizeOptions: { resultEqualityCheck: shallowEqual },
});

export const getDashCardVisibleTimelineEvents = createCachedSelector(
  [getTimelineEventsVisibilityContext, getDashCardTimelineEventsVisibility],
  (context, visibility): TimelineEvent[] => {
    const events = resolveVisibleTimelineEvents({ ...context, visibility });
    return events.length > 0 ? events : NO_EVENTS;
  },
)({
  keySelector: (_state, dashcardId) => dashcardId,
  selectorCreator: createStableEventsSelector,
});

export const getDashCardSelectedTimelineEventIds = (
  state: State,
  dashcardId?: DashCardId,
): TimelineEventId[] => {
  const selection = state.dashboard.timelineEvents.selection;
  return selection &&
    (selection.dashcardId == null || selection.dashcardId === dashcardId)
    ? selection.eventIds
    : NO_EVENT_IDS;
};

export const getTimelineEventsDashCardIds = createSelector(
  [(state: State) => getCurrentDashcards(state), getDashcardDataMap],
  (dashcards, dashcardDataMap) => {
    return dashcards
      .filter(
        (dashcard) =>
          canDashCardDisplayTimelineEvents(dashcard) &&
          computeDashCardTimeseriesXAxis(
            dashcard,
            dashcardDataMap[dashcard.id],
          ) != null,
      )
      .map((dashcard) => dashcard.id);
  },
);

export const getDashboardTimelineEventsAggregate = createSelector(
  [
    getTimelineEventsDashCardIds,
    getTimelineEventsVisibilityContext,
    getTimelineEventsOverrides,
    (state: State) => getDashcards(state),
  ],
  (dashcardIds, context, overrides, dashcards) =>
    aggregateVisibleEventIds(
      dashcardIds.map((dashcardId) =>
        resolveVisibleTimelineEvents({
          ...context,
          visibility: resolveDashCardVisibility(
            overrides,
            dashcards,
            dashcardId,
          ),
        }).map((event) => event.id),
      ),
    ),
);
