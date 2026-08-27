import type { EChartsType } from "echarts/core";
import { useCallback, useEffect, useMemo } from "react";

import {
  extractSeriesDataKeyFromName,
  getBoxPlotClickData,
  isBoxPlotSeriesEvent,
} from "metabase/visualizations/echarts/boxplot";
import type { BoxPlotChartModel } from "metabase/visualizations/echarts/boxplot/model/types";
import type { EChartsSeriesMouseEvent } from "metabase/visualizations/echarts/types";
import { useChartYAxisVisibility } from "metabase/visualizations/hooks/use-chart-y-axis-visibility";
import type {
  ComputedVisualizationSettings,
  HoveredObject,
  OnChangeCardAndRun,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";
import type { CardId, RawSeries } from "metabase-types/api";

type UseBoxPlotEventsProps = {
  chartRef: React.RefObject<EChartsType | undefined>;
  chartModel: BoxPlotChartModel;
  rawSeries: RawSeries;
  settings: ComputedVisualizationSettings;
  hovered: HoveredObject | null | undefined;
  onHoverChange: VisualizationProps["onHoverChange"];
  onVisualizationClick: VisualizationProps["onVisualizationClick"];
  visualizationIsClickable: VisualizationProps["visualizationIsClickable"];
  onChangeCardAndRun: VisualizationProps["onChangeCardAndRun"];
};

function handleOpenQuestion(
  cardId: CardId | undefined,
  rawSeries: RawSeries,
  onChangeCardAndRun: OnChangeCardAndRun | null | undefined,
) {
  if (cardId != null && onChangeCardAndRun) {
    const nextCard =
      rawSeries.find((series) => series.card.id === cardId)?.card ??
      rawSeries[0].card;
    onChangeCardAndRun({ nextCard });
  }
}

function getBoxPlotSeriesHovered(
  chartModel: BoxPlotChartModel,
  event: EChartsSeriesMouseEvent,
): HoveredObject | null {
  const { seriesType, seriesId, seriesName } = event;
  const { seriesModels } = chartModel;

  let seriesIndex = -1;

  if (seriesType === "boxplot" && seriesId) {
    seriesIndex = seriesModels.findIndex((s) => s.dataKey === seriesId);
  } else if (seriesName) {
    const extractedDataKey = extractSeriesDataKeyFromName(seriesName);
    if (extractedDataKey) {
      seriesIndex = seriesModels.findIndex(
        (s) => s.dataKey === extractedDataKey,
      );
    }
  }

  if (seriesIndex < 0) {
    return null;
  }

  return { index: seriesIndex };
}

export function useBoxPlotEvents({
  chartRef,
  chartModel,
  rawSeries,
  settings,
  hovered,
  onHoverChange,
  onVisualizationClick,
  visualizationIsClickable,
  onChangeCardAndRun,
}: UseBoxPlotEventsProps) {
  useChartYAxisVisibility({
    chartRef,
    seriesModels: chartModel.seriesModels,
    leftAxisModel: chartModel.leftAxisModel,
    rightAxisModel: chartModel.rightAxisModel,
    leftAxisSeriesKeys: chartModel.leftAxisSeriesKeys,
    hovered,
  });

  useEffect(
    function handleHoverStates() {
      const chart = chartRef.current;
      if (!chart || hovered == null || hovered.index == null) {
        return;
      }

      const hoveredSeriesModel = chartModel.seriesModels[hovered.index];
      if (!hoveredSeriesModel || !hoveredSeriesModel.visible) {
        return;
      }

      const hoveredDataKey = hoveredSeriesModel.dataKey;

      chart.dispatchAction({
        type: "highlight",
        seriesId: hoveredDataKey,
      });

      return () => {
        chart.dispatchAction({
          type: "downplay",
          seriesId: hoveredDataKey,
        });
      };
    },
    [chartRef, chartModel.seriesModels, hovered],
  );

  const handleClick = useCallback(
    (event: EChartsSeriesMouseEvent) => {
      if (!isBoxPlotSeriesEvent(event)) {
        return;
      }

      const clickData = getBoxPlotClickData(chartModel, settings, event);

      if (clickData && !visualizationIsClickable(clickData)) {
        handleOpenQuestion(clickData.cardId, rawSeries, onChangeCardAndRun);
      }

      onVisualizationClick(clickData);
    },
    [
      chartModel,
      rawSeries,
      settings,
      onVisualizationClick,
      visualizationIsClickable,
      onChangeCardAndRun,
    ],
  );

  const eventHandlers: EChartsEventHandler[] = useMemo(
    () => [
      {
        eventName: "mouseout",
        query: "series",
        handler: () => {
          onHoverChange?.(null);
        },
      },
      {
        eventName: "mousemove",
        query: "series",
        handler: (event: EChartsSeriesMouseEvent) => {
          if (!isBoxPlotSeriesEvent(event)) {
            return;
          }

          const hoveredObject = getBoxPlotSeriesHovered(chartModel, event);
          const isSameDatumHovered = hoveredObject?.index === hovered?.index;

          if (!isSameDatumHovered) {
            onHoverChange?.(hoveredObject);
          }
        },
      },
      {
        eventName: "click",
        handler: handleClick,
      },
    ],
    [handleClick, chartModel, hovered, onHoverChange],
  );

  return { eventHandlers };
}
