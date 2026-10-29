import { createSelector } from "@reduxjs/toolkit";
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
import type { TimeseriesXAxis } from "metabase/viz-core";
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

const shallowEqualResult = {
  memoizeOptions: { resultEqualityCheck: shallowEqual },
};

const getTimelineEventsOverrides = (state: State) =>
  state.dashboard.timelineEvents.overrides;

const getTimelineEventsEnabledByDashCard = (state: State) =>
  state.dashboard.timelineEvents.enabledByDashCard;

export const getIsDashCardTimelineEventsEnabled = (
  state: State,
  dashcardId: DashCardId,
): boolean => getTimelineEventsEnabledByDashCard(state)[dashcardId] !== false;

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

// keyed weakly on the dashcard and its data, independent of the rest of the state
const computeCachedDashCardTimeseriesXAxis = createSelector(
  [
    (dashcard: DashboardCard) => dashcard,
    (
      _dashcard: DashboardCard,
      dashcardData: DashCardDataMap[number] | undefined,
    ) => dashcardData,
  ],
  computeDashCardTimeseriesXAxis,
);

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

export const getDashCardVisibleTimelineEventIds = createSelector(
  [getTransformedTimelines, getDashCardTimelineEventsVisibility],
  (timelines, visibility): TimelineEventId[] => {
    const ids = resolveVisibleTimelineEvents({ timelines, visibility }).map(
      (event) => event.id,
    );
    return ids.length > 0 ? ids : NO_EVENT_IDS;
  },
  shallowEqualResult,
);

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
  [
    getCurrentDashcards,
    getSelectedTabId,
    getDashcardDataMap,
    getTimelineEventsEnabledByDashCard,
  ],
  (dashcards, selectedTabId, dashcardDataMap, enabledByDashCard) =>
    dashcards
      .filter((dashcard) => {
        const dashcardData = dashcardDataMap[dashcard.id];
        return (
          isDashCardOnTab(dashcard, selectedTabId) &&
          shouldDashCardDisplayTimelineEvents(dashcard) &&
          enabledByDashCard[dashcard.id] !== false &&
          (isDashcardLoading(dashcard, dashcardData) ||
            computeCachedDashCardTimeseriesXAxis(dashcard, dashcardData) !=
              null)
        );
      })
      .map((dashcard) => dashcard.id),
  shallowEqualResult,
);

// absent while a chart is still loading, so the panel does not filter events out prematurely
export const getTimelineEventsDashCardXAxes = createSelector(
  [getTimelineEventsDashCardIds, getDashcards, getDashcardDataMap],
  (dashcardIds, dashcards, dashcardDataMap): TimeseriesXAxis[] | null => {
    const xAxes = dashcardIds.flatMap((dashcardId) => {
      const dashcard = dashcards[dashcardId];
      const xAxis = dashcard
        ? computeCachedDashCardTimeseriesXAxis(
            dashcard,
            dashcardDataMap[dashcardId],
          )
        : null;
      return xAxis ? [xAxis] : [];
    });
    return xAxes.length === dashcardIds.length ? xAxes : null;
  },
  shallowEqualResult,
);

export const getHasSelectedTimelineEvents = createSelector(
  [getTimelineEventsDashCardIds, getTimelineEventsOverrides, getDashcards],
  (dashcardIds, overrides, dashcards) =>
    dashcardIds.some(
      (dashcardId) =>
        (resolveDashCardVisibility(overrides, dashcards, dashcardId)?.[
          "timeline.selected_timeline_ids"
        ]?.length ?? 0) > 0,
    ),
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
