import type { Dayjs } from "dayjs";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { SidebarContent } from "metabase/common/components/SidebarContent";
import { getUiControls } from "metabase/query_builder/selectors";
import { MODAL_TYPES, type QueryModalType } from "metabase/querying/constants";
import { useDispatch, useSelector } from "metabase/redux";
import { onOpenTimelines } from "metabase/redux/query-builder";
import TimelinePanel from "metabase/timelines/questions/containers/TimelinePanel";
import { Box, Button, Icon } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Timeline, TimelineEvent } from "metabase-types/api";

export interface TimelineSidebarProps {
  question: Question;
  timelines: Timeline[];
  visibleTimelineEventIds: number[];
  selectedTimelineEventIds: number[];
  xDomain?: [Dayjs, Dayjs];
  onShowTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
  onHideTimelineEvents: (timelineEvent: TimelineEvent[]) => void;
  onSelectTimelineEvents?: (timelineEvents: TimelineEvent[]) => void;
  onDeselectTimelineEvents?: () => void;
  onOpenModal?: (modal: QueryModalType, modalContext?: unknown) => void;
  onClose?: () => void;
}

export const TimelineSidebar = ({
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
  const dispatch = useDispatch();
  const { focusedTimelineEventIds } = useSelector(getUiControls);

  const displayedTimelines = useMemo(
    () => getFocusedTimelines(timelines, focusedTimelineEventIds),
    [timelines, focusedTimelineEventIds],
  );

  const handleShowAllEvents = useCallback(() => {
    dispatch(onOpenTimelines());
  }, [dispatch]);

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

const formatTitle = (xDomain?: [Dayjs, Dayjs]) => {
  return xDomain
    ? t`Events between ${formatDate(xDomain[0])} and ${formatDate(xDomain[1])}`
    : t`Events`;
};

const formatDate = (date: Dayjs) => {
  return date.format("ll");
};
