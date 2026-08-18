import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { SidebarContent } from "metabase/common/components/SidebarContent";
import {
  getTimeseriesDataInterval,
  getUiControls,
} from "metabase/query_builder/selectors";
import { MODAL_TYPES, type QueryModalType } from "metabase/querying/constants";
import { useDispatch, useSelector } from "metabase/redux";
import { onOpenTimelines } from "metabase/redux/query-builder";
import TimelinePanel from "metabase/timelines/panel/containers/TimelinePanel";
import {
  formatTitle,
  getEventsXDomain,
  getFocusedTimelines,
} from "metabase/timelines/panel/utils";
import { Box, Button, Icon } from "metabase/ui";
import type { DateRange } from "metabase/visualizations/echarts/cartesian/model/types";
import type Question from "metabase-lib/v1/Question";
import type { Timeline, TimelineEvent } from "metabase-types/api";

export interface TimelineSidebarProps {
  question: Question;
  timelines: Timeline[];
  visibleTimelineEventIds: number[];
  selectedTimelineEventIds: number[];
  xDomain?: DateRange;
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
  const dataInterval = useSelector(getTimeseriesDataInterval);

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
