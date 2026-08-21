import { useCallback, useMemo } from "react";

import {
  type TimelineEventsVisibilityUpdate,
  deselectTimelineEvents,
  selectTimelineEvents,
  updateDashCardsTimelineEventsVisibility,
} from "metabase/dashboard/actions";
import { useDispatch } from "metabase/redux";
import {
  hideTimelineEvents,
  hideTimelines,
  showTimelineEvents,
  showTimelines,
} from "metabase/visualizations/lib/timeline-events-visibility";
import type { DashCardId, Timeline, TimelineEvent } from "metabase-types/api";

export const useTimelineEventsHandlers = ({
  dashcardIds,
  selectionDashcardId,
}: {
  dashcardIds: DashCardId[];
  selectionDashcardId?: DashCardId;
}) => {
  const dispatch = useDispatch();

  const updateVisibility = useCallback(
    (update: TimelineEventsVisibilityUpdate) =>
      dispatch(updateDashCardsTimelineEventsVisibility(dashcardIds, update)),
    [dispatch, dashcardIds],
  );

  return useMemo(
    () => ({
      onShowTimelineEvents: (events: TimelineEvent[]) =>
        updateVisibility((visibility, context) =>
          showTimelineEvents(visibility, events, context),
        ),
      onHideTimelineEvents: (events: TimelineEvent[]) =>
        updateVisibility((visibility, context) =>
          hideTimelineEvents(visibility, events, context),
        ),
      onShowTimeline: (timeline: Timeline) =>
        updateVisibility((visibility) => showTimelines(visibility, [timeline])),
      onHideTimeline: (timeline: Timeline) =>
        updateVisibility((visibility) => hideTimelines(visibility, [timeline])),
      onSelectEvents: (events: TimelineEvent[]) =>
        dispatch(
          selectTimelineEvents({
            dashcardId: selectionDashcardId,
            eventIds: events.map((event) => event.id),
          }),
        ),
      onDeselectEvents: () => dispatch(deselectTimelineEvents()),
    }),
    [dispatch, updateVisibility, selectionDashcardId],
  );
};
