import { useState } from "react";

import { useDashboardContext } from "metabase/dashboard/context";
import { getDashboardCollectionId } from "metabase/dashboard/timeline-events";
import { useSelector } from "metabase/redux";
import {
  type TimelineEventModalState,
  TimelineEventModals,
} from "metabase/timelines/panel/components/TimelineEventModals";
import { TimelineSidebarContent } from "metabase/timelines/panel/components/TimelineSidebarContent";
import type { DashCardId, Timeline, TimelineEventId } from "metabase-types/api";

import { useTimelineEventsHandlers } from "./use-timeline-events-handlers";

export interface EventsPanelProps {
  title: string;
  onShowAllEvents?: () => void;
  /** the charts the toggles apply to */
  dashcardIds: DashCardId[];
  /** the chart a selected event is highlighted on; absent = every chart */
  selectionDashcardId?: DashCardId;
  timelines: Timeline[];
  visibleEventIds: TimelineEventId[];
  partiallyVisibleEventIds?: TimelineEventId[];
  selectedEventIds: TimelineEventId[];
}

export function EventsPanel({
  title,
  onShowAllEvents,
  dashcardIds,
  selectionDashcardId,
  timelines,
  visibleEventIds,
  partiallyVisibleEventIds,
  selectedEventIds,
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
  const [modal, setModal] = useState<TimelineEventModalState | null>(null);

  return (
    <>
      <TimelineSidebarContent
        title={title}
        onShowAllEvents={onShowAllEvents}
        onClose={closeSidebar}
        timelines={timelines}
        collectionId={collectionId}
        visibleEventIds={visibleEventIds}
        partiallyVisibleEventIds={partiallyVisibleEventIds}
        selectedEventIds={selectedEventIds}
        onNewEvent={() => setModal({ type: "new" })}
        onEditEvent={(event) => setModal({ type: "edit", eventId: event.id })}
        onMoveEvent={(event) => setModal({ type: "move", eventId: event.id })}
        onShowTimelineEvents={onShowTimelineEvents}
        onHideTimelineEvents={onHideTimelineEvents}
        onShowTimeline={onShowTimeline}
        onHideTimeline={onHideTimeline}
        onSelectEvents={onSelectEvents}
        onDeselectEvents={onDeselectEvents}
      />
      <TimelineEventModals
        modal={modal}
        collectionId={collectionId}
        onEventCreated={onEventCreated}
        onClose={() => setModal(null)}
      />
    </>
  );
}
