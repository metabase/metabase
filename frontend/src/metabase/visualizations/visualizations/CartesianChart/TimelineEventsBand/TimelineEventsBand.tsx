import type { EChartsType } from "echarts/core";
import { useEffect, useMemo, useState } from "react";

import {
  TIMELINE_BAND_HEIGHT,
  TIMELINE_EVENTS_BAND,
} from "metabase/visualizations/echarts/cartesian/constants/style";
import type { ChartLayout } from "metabase/visualizations/echarts/cartesian/layout/types";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";

import { TimelineEventChip } from "./TimelineEventChip";
import S from "./TimelineEventsBand.module.css";
import { getPositionedTimelineEventGroups } from "./utils";

interface TimelineEventsBandProps {
  chartInstance?: EChartsType;
  chartSize: { width: number; height: number };
  timelineEventsModel: TimelineEventsModel | null;
  chartLayout: ChartLayout;
  xAxisIndex: number;
  onOpenTimelines?: () => void;
}

export const TimelineEventsBand = ({
  chartInstance,
  chartSize,
  timelineEventsModel,
  chartLayout,
  xAxisIndex,
  onOpenTimelines,
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

  // The gray band sits `marginY` below the plot bottom; chips center inside it.
  const gridBottom = chartSize.height - chartLayout.padding.bottom;
  const trackTop = gridBottom + TIMELINE_EVENTS_BAND.marginY;
  const centerY = trackTop + TIMELINE_BAND_HEIGHT / 2;

  // The plot area spans the ECharts grid insets, which equal the layout padding.
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
    });
    // `renderTick` intentionally re-derives positions after ECharts settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chartInstance,
    timelineEventsModel,
    plotLeft,
    plotRight,
    xAxisIndex,
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
      {positionedGroups.map((positioned) => (
        <TimelineEventChip
          key={positioned.group.date}
          positioned={positioned}
          centerY={centerY}
          onOpenTimelines={onOpenTimelines}
        />
      ))}
    </div>
  );
};
