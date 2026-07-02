import type { EChartsType } from "echarts/core";
import { useEffect, useMemo, useState } from "react";

import {
  TIMELINE_BAND_HEIGHT,
  TIMELINE_EVENTS_BAND,
} from "metabase/visualizations/echarts/cartesian/constants/style";
import type { ChartLayout } from "metabase/visualizations/echarts/cartesian/layout/types";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import type { TimelineEvent, TimelineEventId } from "metabase-types/api";

import { TimelineEventChip } from "./TimelineEventChip";
import S from "./TimelineEventsBand.module.css";
import { getPositionedTimelineEventGroups } from "./utils";

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
}: TimelineEventsBandProps) => {
  // ECharts settles its layout asynchronously, so positions read from
  // `convertToPixel` can be stale right after an option/size change. Recompute
  // once the chart reports it has finished rendering.
  const [renderTick, setRenderTick] = useState(0);
  useEffect(() => {
    if (!chartInstance) {
      return;
    }
    const handleFinished = () => setRenderTick((tick) => tick + 1);
    chartInstance.on("finished", handleFinished);
    return () => {
      chartInstance.off("finished", handleFinished);
    };
  }, [chartInstance]);

  const gridBottom = chartSize.height - chartLayout.padding.bottom;
  const trackTop = gridBottom + TIMELINE_EVENTS_BAND.marginY;
  const centerY = trackTop + TIMELINE_BAND_HEIGHT / 2;

  const plotLeft = chartLayout.padding.left;
  const plotRight = chartSize.width - chartLayout.padding.right;

  const positionedGroups = useMemo(() => {
    if (
      chartInstance == null ||
      timelineEventsModel == null ||
      timelineEventsModel.length === 0 ||
      chartSize.width === 0
    ) {
      return [];
    }
    return getPositionedTimelineEventGroups({
      timelineEventsModel,
      chartInstance,
      plotBounds: { left: plotLeft, right: plotRight },
      xAxisIndex,
      selectedEventIds: selectedTimelineEventIds ?? [],
    });
    // `renderTick` intentionally re-derives positions after ECharts settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chartInstance,
    timelineEventsModel,
    plotLeft,
    plotRight,
    xAxisIndex,
    selectedTimelineEventIds,
    chartSize.width,
    chartSize.height,
    renderTick,
  ]);

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
          onOpenTimelines={onOpenTimelines}
          onSelectTimelineEvents={onSelectTimelineEvents}
          onDeselectTimelineEvents={onDeselectTimelineEvents}
        />
      ))}
    </div>
  );
};
