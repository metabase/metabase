import { useDashboardContext } from "metabase/dashboard/context";
import { getDashboardCollectionId } from "metabase/dashboard/timeline-events";
import { useSelector } from "metabase/redux";
import { TimelineSidebar } from "metabase/timelines/panel/components/TimelineSidebar";
import type { TimeseriesXAxis } from "metabase/viz-core";
import type { DashCardId, Timeline, TimelineEventId } from "metabase-types/api";

import { useTimelineEventsHandlers } from "./use-timeline-events-handlers";

export interface EventsPanelProps {
  /** the charts the toggles apply to */
  dashcardIds: DashCardId[];
  /** the chart a selected event is highlighted on; absent = every chart */
  selectionDashcardId?: DashCardId;
  timelines: Timeline[];
  visibleEventIds: TimelineEventId[];
  partiallyVisibleEventIds?: TimelineEventId[];
  selectedEventIds: TimelineEventId[];
  focusedEventIds?: TimelineEventId[];
  xAxis?: TimeseriesXAxis | null;
  onShowAllEvents?: () => void;
}

export function EventsPanel({
  dashcardIds,
  selectionDashcardId,
  timelines,
  visibleEventIds,
  partiallyVisibleEventIds,
  selectedEventIds,
  focusedEventIds,
  xAxis,
  onShowAllEvents,
}: EventsPanelProps) {
  const { closeSidebar } = useDashboardContext();
  const collectionId = useSelector(getDashboardCollectionId);
  const {
    onShowTimelineEvents,
    onHideTimelineEvents,
    onShowTimeline,
    onHideTimeline,
    onSelectEvents,
    onDeselectEvents,
    onEventCreated,
  } = useTimelineEventsHandlers({ dashcardIds, selectionDashcardId });

  return (
    <TimelineSidebar
      collectionId={collectionId}
      timelines={timelines}
      visibleEventIds={visibleEventIds}
      partiallyVisibleEventIds={partiallyVisibleEventIds}
      selectedEventIds={selectedEventIds}
      focusedEventIds={focusedEventIds}
      xAxis={xAxis}
      onShowTimelineEvents={onShowTimelineEvents}
      onHideTimelineEvents={onHideTimelineEvents}
      onShowTimeline={onShowTimeline}
      onHideTimeline={onHideTimeline}
      onSelectEvents={onSelectEvents}
      onDeselectEvents={onDeselectEvents}
      onEventCreated={onEventCreated}
      onShowAllEvents={onShowAllEvents}
      onClose={closeSidebar}
    />
  );
}
