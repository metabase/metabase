import type { EChartsType } from "echarts/core";
import { useEffect, useMemo, useState } from "react";

import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";
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
  onOpenTimelines?: () => void;
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

  const bandHeight =
    CHART_STYLE.axisTicksMarginX + CHART_STYLE.timelineEvents.height;
  const centerY =
    chartSize.height - chartLayout.padding.bottom + bandHeight / 2;

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
      bounds: chartLayout.bounds,
      xAxisIndex,
      selectedTimelineEventIds: selectedTimelineEventIds ?? [],
    });
    // `renderTick` intentionally re-derives positions after ECharts settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chartInstance,
    timelineEventsModel,
    chartLayout,
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
          left: chartLayout.bounds.left,
          width: chartLayout.bounds.right - chartLayout.bounds.left,
          top: centerY - CHART_STYLE.timelineEvents.height / 2,
          height: CHART_STYLE.timelineEvents.height,
        }}
      />
      {positionedGroups.map((positioned) => (
        <TimelineEventChip
          key={positioned.group.date}
          positioned={positioned}
          centerY={centerY}
          onOpenTimelines={onOpenTimelines}
          onSelectTimelineEvents={onSelectTimelineEvents}
          onDeselectTimelineEvents={onDeselectTimelineEvents}
        />
      ))}
    </div>
  );
};
