import type { LineSeriesOption } from "echarts/charts";
import type { MarkLine2DDataItemOption } from "echarts/types/src/component/marker/MarkLineModel";

import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import type { RenderingContext } from "metabase/visualizations/types";
import type { TimelineEventId } from "metabase-types/api";

export const TIMELINE_EVENT_SELECTION_SERIES_ID = "timeline-event-selection";

export interface SplitPanelYExtent {
  topY: number;
  bottomY: number;
}

// Draws a vertical marker line for each selected timeline event
export const getTimelineEventsSelectionSeries = (
  timelineEventsModel: TimelineEventsModel,
  selectedEventIds: TimelineEventId[],
  { getColor }: RenderingContext,
  splitPanelYExtent?: SplitPanelYExtent,
): LineSeriesOption | null => {
  const selectedDates = timelineEventsModel
    .filter(({ events }) =>
      events.some((event) => selectedEventIds.includes(event.id)),
    )
    .map(({ date }) => date);

  if (selectedDates.length === 0) {
    return null;
  }

  const markLineData = selectedDates.map((date) => {
    if (splitPanelYExtent) {
      const data: MarkLine2DDataItemOption = [
        { xAxis: date, y: splitPanelYExtent.bottomY },
        { xAxis: date, y: splitPanelYExtent.topY, symbol: "none" },
      ];
      return data;
    }

    return { xAxis: date };
  });

  return {
    id: TIMELINE_EVENT_SELECTION_SERIES_ID,
    animation: false,
    type: "line",
    data: [],
    markLine: {
      symbol: "none",
      lineStyle: {
        type: "solid",
        color: getColor("core-brand"),
        width: CHART_STYLE.timelineEvents.selectionLineWidth,
      },
      label: {
        show: false,
      },
      data: markLineData,
    },
  };
};
