import type { LineSeriesOption } from "echarts/charts";
import type { MarkLine2DDataItemOption } from "echarts/types/src/component/marker/MarkLineModel";

import type { TimelineEventId } from "metabase-types/api";

import type { RenderingContext } from "../../../types";
import { CHART_STYLE } from "../constants/style";

import type { TimelineEventsModel } from "./types";

export const TIMELINE_EVENT_SELECTION_SERIES_ID = "timeline-event-selection";

export const EMPTY_TIMELINE_SELECTION_SERIES: LineSeriesOption = {
  id: TIMELINE_EVENT_SELECTION_SERIES_ID,
  type: "line",
  data: [],
  markLine: { data: [] },
};

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
    .flatMap(({ groups }) => groups)
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
      blur: {
        lineStyle: {
          opacity: 1,
        },
      },
      symbol: "none",
      lineStyle: {
        type: "solid",
        color: getColor("border-strong"),
        width: CHART_STYLE.timelineEvents.selectionLineWidth,
      },
      label: {
        show: false,
      },
      data: markLineData,
    },
  };
};
