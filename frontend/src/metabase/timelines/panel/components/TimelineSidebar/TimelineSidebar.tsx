import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { SidebarContent } from "metabase/common/components/SidebarContent";
import { MODAL_TYPES, type QueryModalType } from "metabase/querying/constants";
import EditEventModal from "metabase/timelines/panel/containers/EditEventModal";
import MoveEventModal from "metabase/timelines/panel/containers/MoveEventModal";
import NewEventModal from "metabase/timelines/panel/containers/NewEventModal";
import TimelinePanel from "metabase/timelines/panel/containers/TimelinePanel";
import { Box, Button, Icon, Modal } from "metabase/ui";
import type { DateRange, TimeSeriesInterval } from "metabase/viz-core";
import type { CollectionId, Timeline, TimelineEvent } from "metabase-types/api";

import {
  formatTitle,
  getEventsXDomain,
  getFocusedTimelines,
} from "../../utils";

type InternalModal =
  | { type: "new-event" }
  | { type: "edit-event"; eventId: number }
  | { type: "move-event"; eventId: number };

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
  const [internalModal, setInternalModal] = useState<InternalModal | null>(
    null,
  );
  const manageModalsInternally = onOpenModal == null;

  const displayedTimelines = useMemo(
    () => getFocusedTimelines(timelines, focusedTimelineEventIds),
    [timelines, focusedTimelineEventIds],
  );

  const focusedXDomain = useMemo(
    () =>
      focusedTimelineEventIds != null
        ? getEventsXDomain(displayedTimelines)
        : undefined,
    [focusedTimelineEventIds, displayedTimelines],
  );

  const title = focusedXDomain
    ? formatTitle(focusedXDomain, dataInterval?.unit)
    : formatTitle(xDomain);

  const handleShowAllEvents = useCallback(() => {
    onShowAllEvents?.();
  }, [onShowAllEvents]);

  const handleNewEvent = useCallback(() => {
    if (manageModalsInternally) {
      setInternalModal({ type: "new-event" });
    } else {
      onOpenModal?.(MODAL_TYPES.NEW_EVENT);
    }
  }, [manageModalsInternally, onOpenModal]);

  const handleEditEvent = useCallback(
    (event: TimelineEvent) => {
      if (manageModalsInternally) {
        setInternalModal({ type: "edit-event", eventId: event.id });
      } else {
        onOpenModal?.(MODAL_TYPES.EDIT_EVENT, event.id);
      }
    },
    [manageModalsInternally, onOpenModal],
  );

  const handleMoveEvent = useCallback(
    (event: TimelineEvent) => {
      if (manageModalsInternally) {
        setInternalModal({ type: "move-event", eventId: event.id });
      } else {
        onOpenModal?.(MODAL_TYPES.MOVE_EVENT, event.id);
      }
    },
    [manageModalsInternally, onOpenModal],
  );

  const handleCloseInternalModal = useCallback(() => {
    setInternalModal(null);
  }, []);

  const handleShowTimeline = useCallback(
    (timeline: Timeline) => onShowTimelineEvents(timeline.events ?? []),
    [onShowTimelineEvents],
  );

  const handleHideTimeline = useCallback(
    (timeline: Timeline) => onHideTimelineEvents(timeline.events ?? []),
    [onHideTimelineEvents],
  );

  const handleToggleEventSelected = useCallback(
    (event: TimelineEvent, isSelected: boolean) => {
      if (isSelected) {
        onSelectTimelineEvents?.([event]);
      } else {
        onDeselectTimelineEvents?.();
      }
    },
    [onSelectTimelineEvents, onDeselectTimelineEvents],
  );

  return (
    <SidebarContent title={title} onClose={onClose}>
      {focusedTimelineEventIds != null && (
        <Box mx="lg" mb="sm">
          <Button
            p={0}
            variant="subtle"
            leftSection={<Icon name="chevronleft" />}
            onClick={handleShowAllEvents}
            data-testid="timeline-sidebar-show-all"
          >
            {t`All events`}
          </Button>
        </Box>
      )}
      <TimelinePanel
        timelines={displayedTimelines}
        collectionId={collectionId}
        visibleEventIds={visibleTimelineEventIds}
        selectedEventIds={selectedTimelineEventIds}
        onNewEvent={handleNewEvent}
        onEditEvent={handleEditEvent}
        onMoveEvent={handleMoveEvent}
        onToggleEventSelected={handleToggleEventSelected}
        onShowTimelineEvents={onShowTimelineEvents}
        onHideTimelineEvents={onHideTimelineEvents}
        onShowTimeline={handleShowTimeline}
        onHideTimeline={handleHideTimeline}
      />
      {manageModalsInternally && internalModal?.type === "new-event" && (
        <Modal
          opened
          onClose={handleCloseInternalModal}
          size="lg"
          withCloseButton={false}
          padding="0"
        >
          <NewEventModal
            collectionId={collectionId}
            onClose={handleCloseInternalModal}
          />
        </Modal>
      )}
      {manageModalsInternally && internalModal?.type === "edit-event" && (
        <Modal
          opened
          onClose={handleCloseInternalModal}
          size="lg"
          withCloseButton={false}
          padding="0"
        >
          <EditEventModal
            eventId={internalModal.eventId}
            onClose={handleCloseInternalModal}
          />
        </Modal>
      )}
      {manageModalsInternally && internalModal?.type === "move-event" && (
        <Modal
          opened
          onClose={handleCloseInternalModal}
          size="lg"
          withCloseButton={false}
          padding="0"
        >
          <MoveEventModal
            eventId={internalModal.eventId}
            collectionId={collectionId}
            onClose={handleCloseInternalModal}
          />
        </Modal>
      )}
    </SidebarContent>
  );
};
