import { useCallback, useMemo } from "react";

import {
  hideTimeline,
  showTimeline,
} from "metabase/query_builder/actions/timelines";
import {
  getTimeseriesDataInterval,
  getUiControls,
} from "metabase/query_builder/selectors";
import { MODAL_TYPES, type QueryModalType } from "metabase/querying/constants";
import { useDispatch, useSelector } from "metabase/redux";
import { onOpenTimelines } from "metabase/redux/query-builder";
import { TimelineSidebarContent } from "metabase/timelines/panel/components/TimelineSidebarContent";
import {
  getFocusedTimelines,
  getTimelineSidebarTitle,
} from "metabase/timelines/panel/utils";
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
  const isFocused = focusedTimelineEventIds != null;

  const displayedTimelines = useMemo(
    () => getFocusedTimelines(timelines, focusedTimelineEventIds),
    [timelines, focusedTimelineEventIds],
  );

  const title = getTimelineSidebarTitle({
    focusedTimelines: displayedTimelines,
    isFocused,
    xAxis: { domain: xDomain ?? null, interval: dataInterval },
  });

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

  const handleShowTimeline = useCallback(
    (timeline: Timeline) => dispatch(showTimeline(timeline)),
    [dispatch],
  );
  const handleHideTimeline = useCallback(
    (timeline: Timeline) => dispatch(hideTimeline(timeline)),
    [dispatch],
  );

  return (
    <TimelineSidebarContent
      title={title}
      onShowAllEvents={isFocused ? handleShowAllEvents : undefined}
      onClose={onClose}
      timelines={displayedTimelines}
      collectionId={question.collectionId()}
      visibleEventIds={visibleTimelineEventIds}
      selectedEventIds={selectedTimelineEventIds}
      onNewEvent={handleNewEvent}
      onEditEvent={handleEditEvent}
      onMoveEvent={handleMoveEvent}
      onSelectEvents={onSelectTimelineEvents}
      onDeselectEvents={onDeselectTimelineEvents}
      onShowTimelineEvents={onShowTimelineEvents}
      onHideTimelineEvents={onHideTimelineEvents}
      onShowTimeline={handleShowTimeline}
      onHideTimeline={handleHideTimeline}
    />
  );
};
