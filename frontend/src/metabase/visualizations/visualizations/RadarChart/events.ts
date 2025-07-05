import type { EChartsType } from "echarts/core";
import { type MutableRefObject, useCallback, useEffect, useMemo } from "react";

import type { RadarChartModel } from "metabase/visualizations/echarts/graph/radar/model/types";
import type {
  ClickObject,
  ComputedVisualizationSettings,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { RawSeries } from "metabase-types/api";

interface ChartEventHandlers {
  eventHandlers: EChartsEventHandler[];
}

export const useChartEvents = (
  chartRef: MutableRefObject<EChartsType | undefined>,
  chartModel: RadarChartModel,
  _rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  onVisualizationClick?: VisualizationProps["onVisualizationClick"],
  clicked?: ClickObject,
): ChartEventHandlers => {
  const handleClick = useCallback(
    (params: any) => {
      if (!onVisualizationClick || params.componentType !== "series") {
        return;
      }

      const { radarColumns } = chartModel;
      const { data: clickedData, seriesIndex } = params;

      if (!clickedData || !radarColumns) {
        return;
      }

      const metricColumn = radarColumns.metrics[seriesIndex];
      const dimensionValue = clickedData.name;

      const clickObject: ClickObject = {
        settings,
        value: clickedData.value[seriesIndex],
        column: metricColumn,
        dimensions: [
          {
            column: radarColumns.dimension,
            value: dimensionValue,
          },
        ],
      };

      onVisualizationClick(clickObject);
    },
    [chartModel, settings, onVisualizationClick],
  );

  // Highlight clicked series
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !clicked) {
      return;
    }

    const { radarColumns } = chartModel;
    if (!radarColumns) {
      return;
    }

    // Find the series that matches the clicked column
    const clickedColumnKey = clicked.column
      ? getColumnKey(clicked.column)
      : null;

    const seriesIndex = radarColumns.metrics.findIndex(
      (metric) => getColumnKey(metric) === clickedColumnKey,
    );

    if (seriesIndex >= 0) {
      chart.dispatchAction({
        type: "highlight",
        seriesIndex,
      });
    }

    return () => {
      chart.dispatchAction({
        type: "downplay",
        seriesIndex,
      });
    };
  }, [chartRef, clicked, chartModel]);

  const eventHandlers: EChartsEventHandler[] = useMemo(
    () => [
      {
        eventName: "click",
        handler: handleClick,
      },
    ],
    [handleClick],
  );

  return { eventHandlers };
};
