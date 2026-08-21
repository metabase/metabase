import {
  createSelector,
  createSelectorCreator,
  lruMemoize,
} from "@reduxjs/toolkit";
import { createCachedSelector } from "re-reselect";

import {
  getCurrentDashcards,
  getDashboard,
} from "metabase/dashboard/selectors";
import type { State } from "metabase/redux/store";
import { getTransformedTimelines } from "metabase/timelines/panel/selectors";
import {
  aggregateVisibleEventIds,
  resolveVisibleTimelineEvents,
} from "metabase/visualizations/lib/timeline-events-visibility";
import type { TimelineEventsVisibilityContext } from "metabase/visualizations/types";
import type {
  DashCardId,
  TimelineEvent,
  TimelineEventId,
  TimelineEventsVisibility,
} from "metabase-types/api";

import { isTimelineEventsDashCard } from "./utils";

const NO_EVENTS: TimelineEvent[] = [];
const NO_EVENT_IDS: TimelineEventId[] = [];

export const getDashboardCollectionId = (state: State) =>
  getDashboard(state)?.collection_id ?? null;

export const getTimelineEventsVisibilityContext = createSelector(
  [getTransformedTimelines, getDashboardCollectionId],
  (timelines, collectionId): TimelineEventsVisibilityContext => ({
    timelines,
    collectionId,
  }),
);

const getTimelineEventsOverrides = (state: State) =>
  state.dashboard.timelineEvents.overrides;

export const getDashCardTimelineEventsVisibility = (
  state: State,
  dashcardId: DashCardId,
): TimelineEventsVisibility | undefined =>
  getTimelineEventsOverrides(state)[dashcardId];

const areEventListsEqual = (a: TimelineEvent[], b: TimelineEvent[]) =>
  a === b || (a.length === b.length && a.every((event, i) => event === b[i]));

const createStableEventsSelector = createSelectorCreator({
  memoize: lruMemoize,
  memoizeOptions: { resultEqualityCheck: areEventListsEqual },
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
  [(state: State) => getCurrentDashcards(state)],
  (dashcards) =>
    dashcards.filter(isTimelineEventsDashCard).map((dashcard) => dashcard.id),
);

export const getDashboardTimelineEventsAggregate = createSelector(
  [
    getTimelineEventsDashCardIds,
    getTimelineEventsVisibilityContext,
    getTimelineEventsOverrides,
  ],
  (dashcardIds, context, overrides) =>
    aggregateVisibleEventIds(
      dashcardIds.map((dashcardId) =>
        resolveVisibleTimelineEvents({
          ...context,
          visibility: overrides[dashcardId],
        }).map((event) => event.id),
      ),
    ),
);
