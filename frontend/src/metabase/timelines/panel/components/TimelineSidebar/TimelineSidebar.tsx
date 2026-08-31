import { useCallback, useMemo, useState } from "react";

import { MODAL_TYPES, type QueryModalType } from "metabase/querying/constants";
import type { DateRange, TimeSeriesInterval } from "metabase/viz-core";
import type { CollectionId, Timeline, TimelineEvent } from "metabase-types/api";

import { getFocusedTimelines, getTimelineSidebarTitle } from "../../utils";
import {
  type TimelineEventModalState,
  TimelineEventModals,
} from "../TimelineEventModals";
import { TimelineSidebarContent } from "../TimelineSidebarContent";

export interface TimelineSidebarProps {
  collectionId: CollectionId | null | undefined;
  timelines: Timeline[];
  visibleTimelineEventIds: number[];
  selectedTimelineEventIds: number[];
  focusedTimelineEventIds?: number[] | null;
  dataInterval?: TimeSeriesInterval | null;
  xDomain?: DateRange;
  onShowTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
  onHideTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
  onSelectTimelineEvents?: (timelineEvents: TimelineEvent[]) => void;
  onDeselectTimelineEvents?: () => void;
  onShowAllEvents?: () => void;
  onOpenModal?: (modal: QueryModalType, modalContext?: unknown) => void;
  onClose?: () => void;
}

export const TimelineSidebar = ({
  collectionId,
  timelines,
  visibleTimelineEventIds,
  selectedTimelineEventIds,
  focusedTimelineEventIds = null,
  dataInterval,
  xDomain,
  onOpenModal,
  onShowTimelineEvents,
  onHideTimelineEvents,
  onSelectTimelineEvents,
  onDeselectTimelineEvents,
  onShowAllEvents,
  onClose,
}: TimelineSidebarProps) => {
  // Callers that own a modal stack pass `onOpenModal`; the rest let the sidebar
  // render the event modals itself.
  const [modal, setModal] = useState<TimelineEventModalState | null>(null);
  const manageModalsInternally = onOpenModal == null;
  const isFocused = focusedTimelineEventIds != null;

  const displayedTimelines = useMemo(
    () => getFocusedTimelines(timelines, focusedTimelineEventIds),
    [timelines, focusedTimelineEventIds],
  );

  const title = getTimelineSidebarTitle({
    focusedTimelines: displayedTimelines,
    isFocused,
    xAxis: { domain: xDomain ?? null, interval: dataInterval ?? null },
  });

  const handleNewEvent = useCallback(() => {
    if (manageModalsInternally) {
      setModal({ type: "new" });
    } else {
      onOpenModal?.(MODAL_TYPES.NEW_EVENT);
    }
  }, [manageModalsInternally, onOpenModal]);

  const handleEditEvent = useCallback(
    (event: TimelineEvent) => {
      if (manageModalsInternally) {
        setModal({ type: "edit", eventId: event.id });
      } else {
        onOpenModal?.(MODAL_TYPES.EDIT_EVENT, event.id);
      }
    },
    [manageModalsInternally, onOpenModal],
  );

  const handleMoveEvent = useCallback(
    (event: TimelineEvent) => {
      if (manageModalsInternally) {
        setModal({ type: "move", eventId: event.id });
      } else {
        onOpenModal?.(MODAL_TYPES.MOVE_EVENT, event.id);
      }
    },
    [manageModalsInternally, onOpenModal],
  );

  const handleCloseModal = useCallback(() => {
    setModal(null);
  }, []);

  const handleShowTimeline = useCallback(
    (timeline: Timeline) => onShowTimelineEvents(timeline.events ?? []),
    [onShowTimelineEvents],
  );

  const handleHideTimeline = useCallback(
    (timeline: Timeline) => onHideTimelineEvents(timeline.events ?? []),
    [onHideTimelineEvents],
  );

  return (
    <>
      <TimelineSidebarContent
        title={title}
        onShowAllEvents={isFocused ? onShowAllEvents : undefined}
        onClose={onClose}
        timelines={displayedTimelines}
        collectionId={collectionId}
        visibleEventIds={visibleTimelineEventIds}
        selectedEventIds={selectedTimelineEventIds}
        onNewEvent={handleNewEvent}
        onEditEvent={handleEditEvent}
        onMoveEvent={handleMoveEvent}
        onShowTimelineEvents={onShowTimelineEvents}
        onHideTimelineEvents={onHideTimelineEvents}
        onShowTimeline={handleShowTimeline}
        onHideTimeline={handleHideTimeline}
        onSelectEvents={onSelectTimelineEvents}
        onDeselectEvents={onDeselectTimelineEvents}
      />
      <TimelineEventModals
        modal={modal}
        collectionId={collectionId}
        onClose={handleCloseModal}
      />
    </>
  );
};
