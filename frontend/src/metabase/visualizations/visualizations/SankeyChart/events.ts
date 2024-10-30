import type { EChartsType } from "echarts/core";
import { useMemo } from "react";

import type {
  ColumnKey,
  SankeyChartModel,
} from "metabase/visualizations/echarts/graph/sankey/model/types";
import { useClickedStateTooltipSync } from "metabase/visualizations/echarts/tooltip";
import type { EChartsSeriesMouseEvent } from "metabase/visualizations/echarts/types";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import type {
  ClickObject,
  ComputedVisualizationSettings,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { RawSeries, RowValue } from "metabase-types/api";

const getSankeyClickData = (
  [
    {
      data: { cols },
    },
  ]: RawSeries,
  columnValues: Record<ColumnKey, RowValue>,
) => {
  return cols.map(col => {
    return {
      col,
      value: columnValues[getColumnKey(col)],
      key: getFriendlyName(col),
    };
  });
};

export const useChartEvents = (
  chartRef: React.MutableRefObject<EChartsType | undefined>,
  chartModel: SankeyChartModel,
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  onVisualizationClick: VisualizationProps["onVisualizationClick"],
  clicked?: ClickObject,
) => {
  const eventHandlers: EChartsEventHandler[] = useMemo(
    () => [
      {
        eventName: "click",
        handler: (event: EChartsSeriesMouseEvent) => {
          const data: ClickObject = {
            event: event.event.event,
            settings,
            data: getSankeyClickData(rawSeries, event.data.columnValues),
          };

          if (event.dataType === "node") {
            const sourceColumn = chartModel.sankeyColumns.source.column;
            data.column = sourceColumn;
            event.data.columnValues[getColumnKey(sourceColumn)];
          } else if (event.dataType === "edge") {
            const valueColumn = chartModel.sankeyColumns.value.column;
            data.column = valueColumn;
            data.value = event.data.columnValues[getColumnKey(valueColumn)];
          }
          onVisualizationClick?.(data);
        },
      },
    ],
    [chartModel, onVisualizationClick, rawSeries, settings],
  );

  useClickedStateTooltipSync(chartRef.current, clicked);

  return {
    eventHandlers,
  };
};
