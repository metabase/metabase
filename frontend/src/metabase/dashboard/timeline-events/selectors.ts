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
  getDashcards,
} from "metabase/dashboard/selectors";
import type {
  DashboardState,
  DashboardTimelineEventsState,
  State,
} from "metabase/redux/store";
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
  [getTransformedTimelines],
  (timelines): TimelineEventsVisibilityContext => ({ timelines }),
);

const getTimelineEventsOverrides = (state: State) =>
  state.dashboard.timelineEvents.overrides;

const resolveDashCardVisibility = (
  overrides: DashboardTimelineEventsState["overrides"],
  dashcards: DashboardState["dashcards"],
  dashcardId: DashCardId,
): TimelineEventsVisibility | undefined =>
  overrides[dashcardId] ??
  dashcards[dashcardId]?.visualization_settings?.["timeline_events.visibility"];

export const getDashCardTimelineEventsVisibility = (
  state: State,
  dashcardId: DashCardId,
): TimelineEventsVisibility | undefined =>
  resolveDashCardVisibility(
    getTimelineEventsOverrides(state),
    getDashcards(state),
    dashcardId,
  );

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

// metabase/dashboard/selectors is wrapped lazily in the input arrays below:
// it can still be evaluating when this module is loaded through
// metabase/dashboard/actions.
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
