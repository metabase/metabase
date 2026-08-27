import { useCallback, useMemo } from "react";

import {
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
import type { TimelineEventsVisibilityUpdate } from "metabase/visualizations/types";
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
        updateVisibility((visibility, timelines) =>
          showTimelineEvents(visibility, events, timelines),
        ),
      onHideTimelineEvents: (events: TimelineEvent[]) =>
        updateVisibility((visibility, timelines) =>
          hideTimelineEvents(visibility, events, timelines),
        ),
      onShowTimeline: (timeline: Timeline) =>
        updateVisibility((visibility, timelines) =>
          showTimelines(visibility, [timeline.id], timelines),
        ),
      onHideTimeline: (timeline: Timeline) =>
        updateVisibility((visibility, timelines) =>
          hideTimelines(visibility, [timeline.id], timelines),
        ),
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
