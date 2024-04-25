import type { Moment } from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { useCallback } from "react";
import { t } from "ttag";

import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import TimelinePanel from "metabase/timelines/questions/containers/TimelinePanel";
import type Question from "metabase-lib/v1/Question";
import type { Timeline, TimelineEvent } from "metabase-types/api";

export interface TimelineSidebarProps {
  question: Question;
  timelines: Timeline[];
  visibleTimelineEventIds: number[];
  selectedTimelineEventIds: number[];
  xDomain?: [Moment, Moment];
  onShowTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
  onHideTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
  onSelectTimelineEvents?: (timelineEvents: TimelineEvent[]) => void;
  onDeselectTimelineEvents?: () => void;
  onOpenModal?: (modal: string, modalContext?: unknown) => void;
  onClose?: () => void;
}

const TimelineSidebar = ({
  question,
  timelines,
  visibleTimelineEventIds,
  selectedTimelineEventIds,
  xDomain,
  onOpenModal,
  onShowTimelineEvents,
  onHideTimelineEvents,
  onSelectTimelineEvents,
  onDeselectTimelineEvents,
  onClose,
}: TimelineSidebarProps) => {
  const handleNewEvent = useCallback(() => {
    onOpenModal?.(MODAL_TYPES.NEW_EVENT);
  }, [onOpenModal]);

  const handleEditEvent = useCallback(
    (event: TimelineEvent) => {
      onOpenModal?.(MODAL_TYPES.EDIT_EVENT, event.id);
    },
    [onOpenModal],
  );

  const handleMoveEvent = useCallback(
    (event: TimelineEvent) => {
      onOpenModal?.(MODAL_TYPES.MOVE_EVENT, event.id);
    },
    [onOpenModal],
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
    <SidebarContent title={formatTitle(xDomain)} onClose={onClose}>
      <TimelinePanel
        timelines={timelines}
        collectionId={question.collectionId()}
        visibleEventIds={visibleTimelineEventIds}
        selectedEventIds={selectedTimelineEventIds}
        onNewEvent={handleNewEvent}
        onEditEvent={handleEditEvent}
        onMoveEvent={handleMoveEvent}
        onToggleEventSelected={handleToggleEventSelected}
        onShowTimelineEvents={onShowTimelineEvents}
        onHideTimelineEvents={onHideTimelineEvents}
      />
    </SidebarContent>
  );
};

const formatTitle = (xDomain?: [Moment, Moment]) => {
  return xDomain
    ? t`Events between ${formatDate(xDomain[0])} and ${formatDate(xDomain[1])}`
    : t`Events`;
};

const formatDate = (date: Moment) => {
  return date.format("ll");
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TimelineSidebar;
