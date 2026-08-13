import dayjs, { type Dayjs, type OpUnitType } from "dayjs";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { SidebarContent } from "metabase/common/components/SidebarContent";
import TimelinePanel from "metabase/query_builder/components/timelines/containers/TimelinePanel";
import {
  getTimeseriesDataInterval,
  getUiControls,
} from "metabase/query_builder/selectors";
import { MODAL_TYPES, type QueryModalType } from "metabase/querying/constants";
import { useDispatch, useSelector } from "metabase/redux";
import { onOpenTimelines } from "metabase/redux/query-builder";
import { Box, Button, Icon } from "metabase/ui";
import { formatDateTimeWithUnit } from "metabase/value-formatting";
import type { CartesianChartDateTimeAbsoluteUnit } from "metabase/visualizations/echarts/cartesian/model/types";
import type Question from "metabase-lib/v1/Question";
import type { DatetimeUnit, Timeline, TimelineEvent } from "metabase-types/api";

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
    ? formatTitle(focusedXDomain, toDatetimeUnit(dataInterval?.unit))
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
