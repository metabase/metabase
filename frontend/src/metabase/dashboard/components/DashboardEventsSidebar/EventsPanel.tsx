import { useCallback } from "react";

import { useListTimelinesQuery } from "metabase/api";
import {
  deselectTimelineEvents,
  selectTimelineEvents,
  updateDashCardsTimelineEventsVisibility,
} from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context";
import { useDispatch } from "metabase/redux";
import {
  TimelineSidebar,
  type TimelineSidebarProps,
} from "metabase/timelines/panel/components/TimelineSidebar";
import type {
  TimelineEventsVisibilityIntent,
  TimelineEventsVisibilityUpdate,
} from "metabase/visualizations/types";
import type { DashCardId, TimelineEvent } from "metabase-types/api";

export type EventsPanelProps = Pick<
  TimelineSidebarProps,
  | "timelines"
  | "visibleEventIds"
  | "partiallyVisibleEventIds"
  | "selectedEventIds"
  | "focusedEventIds"
  | "xAxes"
  | "onShowAllEvents"
> & {
  /** the charts the toggles apply to */
  dashcardIds: DashCardId[];
  /** the chart a selected event is highlighted on; absent = every chart */
  selectionDashcardId?: DashCardId;
};

export function EventsPanel({
  dashcardIds,
  selectionDashcardId,
  timelines,
  visibleEventIds,
  partiallyVisibleEventIds,
  selectedEventIds,
  focusedEventIds,
  xAxes,
  onShowAllEvents,
}: EventsPanelProps) {
  const dispatch = useDispatch();
  const { dashboard, closeSidebar } = useDashboardContext();
  const { isLoading, error } = useListTimelinesQuery({ include: "events" });

  const handleUpdateVisibility = useCallback(
    (
      update: TimelineEventsVisibilityUpdate,
      intent: TimelineEventsVisibilityIntent,
    ) =>
      dispatch(
        updateDashCardsTimelineEventsVisibility(dashcardIds, update, {
          location: selectionDashcardId != null ? "dashcard" : "dashboard",
          intent,
        }),
      ),
    [dispatch, dashcardIds, selectionDashcardId],
  );
  const handleSelectEvents = useCallback(
    (events: TimelineEvent[]) =>
      dispatch(
        selectTimelineEvents({
          dashcardId: selectionDashcardId,
          eventIds: events.map((event) => event.id),
        }),
      ),
    [dispatch, selectionDashcardId],
  );
  const handleDeselectEvents = useCallback(
    () => dispatch(deselectTimelineEvents()),
    [dispatch],
  );

  return (
    <TimelineSidebar
      collectionId={dashboard?.collection_id}
      timelines={timelines}
      visibleEventIds={visibleEventIds}
      partiallyVisibleEventIds={partiallyVisibleEventIds}
      selectedEventIds={selectedEventIds}
      focusedEventIds={focusedEventIds}
      xAxes={xAxes}
      isLoading={isLoading}
      error={error}
      eventSource="dashboard"
      onUpdateVisibility={handleUpdateVisibility}
      onSelectEvents={handleSelectEvents}
      onDeselectEvents={handleDeselectEvents}
      onShowAllEvents={onShowAllEvents}
      onClose={closeSidebar}
    />
  );
}
