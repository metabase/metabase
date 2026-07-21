import type { EChartsType } from "echarts/core";
import { useCallback, useEffect, useState } from "react";

import {
  TIMELINE_BAND_HEIGHT,
  TIMELINE_EVENTS_BAND,
} from "metabase/visualizations/echarts/cartesian/constants/style";
import type { ChartLayout } from "metabase/visualizations/echarts/cartesian/layout/types";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import type { TimelineEvent, TimelineEventId } from "metabase-types/api";

import { TimelineEventChip } from "./TimelineEventChip";
import S from "./TimelineEventsBand.module.css";
import {
  type PositionedTimelineEventGroup,
  arePositionedGroupsEqual,
  getPositionedTimelineEventGroups,
} from "./utils";

interface TimelineEventsBandProps {
  chartInstance?: EChartsType;
  chartSize: { width: number; height: number };
  timelineEventsModel: TimelineEventsModel | null;
  chartLayout: ChartLayout;
  xAxisIndex: number;
  selectedTimelineEventIds?: TimelineEventId[];
  onOpenTimelines?: (eventIds?: number[]) => void;
  onSelectTimelineEvents?: (events: TimelineEvent[]) => void;
  onDeselectTimelineEvents?: () => void;
  onSeeAllEvents?: (events: TimelineEvent[]) => void;
}

export const TimelineEventsBand = ({
  chartInstance,
  chartSize,
  timelineEventsModel,
  chartLayout,
  xAxisIndex,
  selectedTimelineEventIds,
  onOpenTimelines,
  onSelectTimelineEvents,
  onDeselectTimelineEvents,
  onSeeAllEvents,
}: TimelineEventsBandProps) => {
  const gridBottom = chartSize.height - chartLayout.padding.bottom;
  const trackTop = gridBottom + TIMELINE_EVENTS_BAND.marginY;
  const centerY = trackTop + TIMELINE_BAND_HEIGHT / 2;

  const plotLeft = chartLayout.padding.left;
  const plotRight = chartSize.width - chartLayout.padding.right;

  const [positionedGroups, setPositionedGroups] = useState<
    PositionedTimelineEventGroup[]
  >([]);

  const updatePositionedGroups = useCallback(() => {
    const canPosition =
      chartInstance != null &&
      timelineEventsModel != null &&
      timelineEventsModel.length > 0 &&
      chartSize.width > 0;

    const next = canPosition
      ? getPositionedTimelineEventGroups({
          timelineEventsModel,
          chartInstance,
          plotBounds: { left: plotLeft, right: plotRight },
          xAxisIndex,
        })
      : [];

    setPositionedGroups((previous) =>
      arePositionedGroupsEqual(previous, next) ? previous : next,
    );
  }, [
    chartInstance,
    timelineEventsModel,
    plotLeft,
    plotRight,
    xAxisIndex,
    chartSize.width,
  ]);

  useEffect(() => {
    updatePositionedGroups();
  }, [updatePositionedGroups]);

  useEffect(() => {
    if (!chartInstance) {
      return;
    }
    chartInstance.on("finished", updatePositionedGroups);
    return () => {
      chartInstance.off("finished", updatePositionedGroups);
    };
  }, [chartInstance, updatePositionedGroups]);

  if (positionedGroups.length === 0) {
    return null;
  }

  return (
    <div data-testid="timeline-events-band">
      <div
        className={S.track}
        style={{
          left: plotLeft,
          width: plotRight - plotLeft,
          top: trackTop,
          height: TIMELINE_BAND_HEIGHT,
        }}
      />
      {positionedGroups.map((eventsGroup) => (
        <TimelineEventChip
          key={eventsGroup.group.date}
          eventsGroup={eventsGroup}
          centerY={centerY}
          selectedEventIds={selectedTimelineEventIds ?? []}
          onOpenTimelines={onOpenTimelines}
          onSelectTimelineEvents={onSelectTimelineEvents}
          onDeselectTimelineEvents={onDeselectTimelineEvents}
          onSeeAllEvents={onSeeAllEvents}
        />
      ))}
    </div>
  );
};
