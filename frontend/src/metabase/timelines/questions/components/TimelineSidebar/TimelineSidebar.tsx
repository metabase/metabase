import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { SidebarContent } from "metabase/common/components/SidebarContent";
import { type Dayjs, type OpUnitType, dayjs } from "metabase/dayjs";
import { MODAL_TYPES, type QueryModalType } from "metabase/querying/constants";
import EditEventModal from "metabase/timelines/questions/containers/EditEventModal";
import MoveEventModal from "metabase/timelines/questions/containers/MoveEventModal";
import NewEventModal from "metabase/timelines/questions/containers/NewEventModal";
import TimelinePanel from "metabase/timelines/questions/containers/TimelinePanel";
import { Box, Button, Icon, Modal } from "metabase/ui";
import { formatDateTimeWithUnit } from "metabase/value-formatting";
import type {
  CartesianChartDateTimeAbsoluteUnit,
  TimeSeriesInterval,
} from "metabase/viz-core";
import type {
  CollectionId,
  DatetimeUnit,
  Timeline,
  TimelineEvent,
} from "metabase-types/api";

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
  xDomain?: [Dayjs, Dayjs];
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
    ? formatTitle(focusedXDomain, toDatetimeUnit(dataInterval?.unit))
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
        <Box mx="xl" mb="sm">
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

export const getFocusedTimelines = (
  timelines: Timeline[],
  focusedTimelineEventIds: number[] | null,
): Timeline[] => {
  if (focusedTimelineEventIds == null) {
    return timelines;
  }
  const focusedIds = new Set(focusedTimelineEventIds);
  return timelines
    .map((timeline) => ({
      ...timeline,
      events: (timeline.events ?? []).filter((event) =>
        focusedIds.has(event.id),
      ),
    }))
    .filter((timeline) => timeline.events.length > 0);
};

export const getEventsXDomain = (
  timelines: Timeline[],
): [Dayjs, Dayjs] | undefined => {
  const timestamps = timelines
    .flatMap((timeline) => timeline.events ?? [])
    .map((event) => dayjs.utc(event.timestamp));

  if (timestamps.length === 0) {
    return undefined;
  }

  const min = timestamps.reduce((a, b) => (b.isBefore(a) ? b : a));
  const max = timestamps.reduce((a, b) => (b.isAfter(a) ? b : a));
  return [min, max];
};

const toDatetimeUnit = (
  unit?: CartesianChartDateTimeAbsoluteUnit,
): DatetimeUnit | undefined =>
  unit == null || unit === "second" || unit === "ms" ? undefined : unit;

const isPeriodUnit = (unit?: DatetimeUnit) =>
  unit === "week" || unit === "month" || unit === "quarter" || unit === "year";

export const formatTitle = (xDomain?: [Dayjs, Dayjs], unit?: DatetimeUnit) => {
  if (!xDomain) {
    return t`Events`;
  }
  const startLabel = formatDate(xDomain[0], unit);
  const endLabel = formatDate(xDomain[1], unit);
  if (startLabel !== endLabel) {
    return t`Events between ${startLabel} and ${endLabel}`;
  }

  return isPeriodUnit(unit)
    ? t`Events in ${startLabel}`
    : t`Events on ${startLabel}`;
};

const formatDate = (date: Dayjs, unit?: DatetimeUnit) => {
  if (unit == null) {
    return date.format("ll");
  }
  // Unjustified type cast. FIXME
  return formatDateTimeWithUnit(date.startOf(unit as OpUnitType), unit);
};
