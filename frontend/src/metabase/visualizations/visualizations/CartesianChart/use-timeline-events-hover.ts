import { useDebouncedCallback } from "@mantine/hooks";
import type { EChartsOption } from "echarts";
import type { EChartsType } from "echarts/core";
import { useEffect, useRef } from "react";

import {
  type BaseCartesianChartModel,
  type ChartLayout,
  EMPTY_TIMELINE_SELECTION_SERIES,
  type RenderingContext,
  type TimelineEventGroup,
  type TimelineEventsModel,
  getTimelineSelectionSeries,
} from "metabase/viz-core";
import type { TimelineEventId } from "metabase-types/api";

import { getClosestDatumIndex, getDataSeriesEChartsIndices } from "./utils";

const MARKER_LINE_UPDATE_DELAY_MS = 100;

interface UseTimelineEventsHoverParams {
  chartRef: React.MutableRefObject<EChartsType | undefined>;
  hoveredTimelineEventGroup: TimelineEventGroup | null;
  chartModel: BaseCartesianChartModel;
  chartLayout: ChartLayout;
  option: EChartsOption;
  timelineEventsModel: TimelineEventsModel | null;
  renderingContext: RenderingContext;
  display: string;
  selectedTimelineEventIds?: TimelineEventId[];
}

// Reflects the hovered timeline event group on the chart: highlights the
// closest data point and draws the marker line at the group's date.
export function useTimelineEventsHover({
  chartRef,
  hoveredTimelineEventGroup,
  chartModel,
  chartLayout,
  option,
  timelineEventsModel,
  renderingContext,
  display,
  selectedTimelineEventIds,
}: UseTimelineEventsHoverParams) {
  const selectedTimelineEventIdsRef = useRef(selectedTimelineEventIds);
  selectedTimelineEventIdsRef.current = selectedTimelineEventIds;

  const applyMarkerLineDebounced = useDebouncedCallback(
    (applyMarkerLine: () => void) => applyMarkerLine(),
    MARKER_LINE_UPDATE_DELAY_MS,
  );

  useEffect(() => {
    const chart = chartRef.current;
    if (chart == null || hoveredTimelineEventGroup == null) {
      return;
    }

    const dataIndex = getClosestDatumIndex(
      chartModel.transformedDataset,
      hoveredTimelineEventGroup.date,
    );
    const seriesIndices = getDataSeriesEChartsIndices(
      chartModel.seriesModels,
      option,
    );
    const hasHighlight = dataIndex >= 0 && seriesIndices.length > 0;

    if (hasHighlight) {
      seriesIndices.forEach((seriesIndex) => {
        chart.dispatchAction({
          type: "highlight",
          seriesIndex,
          // ECharts quirk: with a scalar dataIndex the highlight action blurs
          // the chart without emphasizing the datum
          dataIndex: [dataIndex],
        });
      });
    }

    const showMarkerLine = display !== "bar" && timelineEventsModel != null;
    const applyMarkerLine = (eventIds: TimelineEventId[]) => {
      const series = getTimelineSelectionSeries(
        timelineEventsModel,
        eventIds,
        chartModel,
        chartLayout,
        renderingContext,
      );
      chart.setOption({
        series: [series ?? EMPTY_TIMELINE_SELECTION_SERIES],
      });
    };

    const scheduleMarkerLine = (eventIds: TimelineEventId[]) => {
      applyMarkerLineDebounced(() => {
        if (!chart.isDisposed()) {
          applyMarkerLine(eventIds);
        }
      });
    };

    if (showMarkerLine) {
      const hoveredEventIds = hoveredTimelineEventGroup.events.map(
        (event) => event.id,
      );
      scheduleMarkerLine([
        ...new Set([
          ...(selectedTimelineEventIdsRef.current ?? []),
          ...hoveredEventIds,
        ]),
      ]);
    }

    return () => {
      if (hasHighlight) {
        seriesIndices.forEach((seriesIndex) => {
          chart.dispatchAction({
            type: "downplay",
            seriesIndex,
            dataIndex: [dataIndex],
          });
        });
      }
      if (showMarkerLine) {
        scheduleMarkerLine(selectedTimelineEventIdsRef.current ?? []);
      }
    };
  }, [
    chartRef,
    hoveredTimelineEventGroup,
    chartModel,
    option,
    timelineEventsModel,
    chartLayout,
    renderingContext,
    display,
    applyMarkerLineDebounced,
  ]);
}
