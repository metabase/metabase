import type { EChartsType } from "echarts/core";
import { useMemo } from "react";

import type {
  ColumnKey,
  SankeyChartModel,
  SankeyLink,
  SankeyNode,
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
import type { DatasetColumn, RawSeries, RowValue } from "metabase-types/api";

const getSankeyClickData = (
  [
    {
      data: { cols },
    },
  ]: RawSeries,
  columnValues: Record<ColumnKey, RowValue>,
  predicate: (col: DatasetColumn, index: number) => boolean = () => true,
) => {
  return cols.filter(predicate).map(col => {
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
        handler: (event: EChartsSeriesMouseEvent<SankeyLink | SankeyNode>) => {
          const clickData: ClickObject = {
            event: event.event.event,
            settings,
          };

          if (event.dataType === "node") {
            const source = chartModel.sankeyColumns.source;
            const target = chartModel.sankeyColumns.target;

            clickData.column = target.column;
            clickData.value =
              event.data.inputColumnValues[getColumnKey(target.column)];

            clickData.data = getSankeyClickData(
              rawSeries,
              event.data.inputColumnValues,
              (_col, index) => index === source.index || index === target.index,
            );
          } else if (event.dataType === "edge") {
            const valueColumn = chartModel.sankeyColumns.value.column;
            clickData.column = valueColumn;
            clickData.value =
              event.data.columnValues[getColumnKey(valueColumn)];
            clickData.data = getSankeyClickData(
              rawSeries,
              event.data.columnValues,
            );
          }

          onVisualizationClick?.(clickData);
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

export const getSankeyClickEvent = (node: any): ClickObject => {
  return {
    element: {
      source: node.name, // The name of the clicked node
      sourceLinks: node.sourceLinks, // Outgoing links
      targetLinks: node.targetLinks, // Incoming links
    },
    event: new MouseEvent("click"),
    // These fields are required for drills to work
    dimensions: [
      {
        value: node.name,
        column: node.column,
      },
    ],
    settings: {},
  };
};
