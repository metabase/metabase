import {
  createSelector,
  createSelectorCreator,
  lruMemoize,
} from "@reduxjs/toolkit";
import { createCachedSelector } from "re-reselect";
import { shallowEqual } from "react-redux";

import {
  getCurrentDashcards,
  getDashCardById,
  getDashcardData,
  getDashcardDataMap,
  getDashcards,
  getSelectedTabId,
} from "metabase/dashboard/selectors";
import { isDashCardOnTab, isDashcardLoading } from "metabase/dashboard/utils";
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
  DashCardDataMap,
  DashCardId,
  DashboardCard,
  TimelineEventId,
  TimelineEventsVisibility,
} from "metabase-types/api";

import {
  computeDashCardTimeseriesXAxis,
  shouldDashCardDisplayTimelineEvents,
} from "./utils";

const NO_EVENT_IDS: TimelineEventId[] = [];

const createShallowEqualResultSelector = createSelectorCreator({
  memoize: lruMemoize,
  memoizeOptions: { resultEqualityCheck: shallowEqual },
});

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

// memoized per dashcard on the dashcard and its data, independent of the rest of the state
const computeCachedDashCardTimeseriesXAxis = createCachedSelector(
  [
    (dashcard: DashboardCard) => dashcard,
    (
      _dashcard: DashboardCard,
      dashcardData: DashCardDataMap[number] | undefined,
    ) => dashcardData,
  ],
  computeDashCardTimeseriesXAxis,
)((dashcard) => dashcard.id);

export const getDashCardTimeseriesXAxis = (
  state: State,
  dashcardId: DashCardId,
) => {
  const dashcard = getDashCardById(state, dashcardId);
  return dashcard
    ? computeCachedDashCardTimeseriesXAxis(
        dashcard,
        getDashcardData(state, dashcardId),
      )
    : null;
};

export const getIsTimelineEventsDashCard = (
  state: State,
  dashcardId: DashCardId,
) => getDashCardTimeseriesXAxis(state, dashcardId) != null;

export const getDashCardVisibleTimelineEventIds = createCachedSelector(
  [getTransformedTimelines, getDashCardTimelineEventsVisibility],
  (timelines, visibility): TimelineEventId[] => {
    const ids = resolveVisibleTimelineEvents({ timelines, visibility }).map(
      (event) => event.id,
    );
    return ids.length > 0 ? ids : NO_EVENT_IDS;
  },
)({
  keySelector: (_state, dashcardId) => dashcardId,
  selectorCreator: createShallowEqualResultSelector,
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

export const getTimelineEventsDashCardIds = createShallowEqualResultSelector(
  [getCurrentDashcards, getSelectedTabId, getDashcardDataMap],
  (dashcards, selectedTabId, dashcardDataMap) =>
    dashcards
      .filter((dashcard) => {
        const dashcardData = dashcardDataMap[dashcard.id];
        return (
          isDashCardOnTab(dashcard, selectedTabId) &&
          shouldDashCardDisplayTimelineEvents(dashcard) &&
          (isDashcardLoading(dashcard, dashcardData) ||
            computeCachedDashCardTimeseriesXAxis(dashcard, dashcardData) !=
              null)
        );
      })
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
