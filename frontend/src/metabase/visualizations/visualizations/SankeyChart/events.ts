import type { EChartsType } from "echarts/core";
import { useMemo } from "react";

import type {
  ColumnKey,
  SankeyChartColumns,
  SankeyLink,
  SankeyNode,
} from "metabase/visualizations/echarts/graph/sankey/model/types";
import { useClickedStateTooltipSync } from "metabase/visualizations/echarts/tooltip";
import type { EChartsSeriesMouseEvent } from "metabase/visualizations/echarts/types";
import type {
  ClickObject,
  ComputedVisualizationSettings,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type {
  Card,
  DatasetColumn,
  RawSeries,
  RowValue,
} from "metabase-types/api";

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
      key: col.display_name,
    };
  });
};

const isSankeyEdgeEvent = (
  event: EChartsSeriesMouseEvent<SankeyLink | SankeyNode>,
): event is EChartsSeriesMouseEvent<SankeyLink> => event.dataType === "edge";

const isSankeyNodeEvent = (
  event: EChartsSeriesMouseEvent<SankeyLink | SankeyNode>,
): event is EChartsSeriesMouseEvent<SankeyNode> => event.dataType === "node";

const isNativeQuery = (card: Card) => card.dataset_query?.type === "native";

export const createSankeyClickData = (
  event: EChartsSeriesMouseEvent<SankeyLink | SankeyNode>,
  sankeyColumns: SankeyChartColumns,
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
): ClickObject | undefined => {
  const clickData: ClickObject = {
    event: event.event.event,
    settings,
  };

  if (isSankeyNodeEvent(event)) {
    const source = sankeyColumns.source;
    const target = sankeyColumns.target;

    clickData.column = event.data.hasInputs ? target.column : source.column;
    clickData.value = event.data.rawName;

    clickData.data = getSankeyClickData(
      rawSeries,
      event.data.inputColumnValues,
      (_col, index) => index === source.index || index === target.index,
    );
  } else if (isSankeyEdgeEvent(event)) {
    if (isNativeQuery(rawSeries[0].card)) {
      return;
    }

    clickData.data = getSankeyClickData(rawSeries, event.data.columnValues);
    clickData.dimensions = [
      {
        column: sankeyColumns.source.column,
        value: event.data.source,
      },
      {
        column: sankeyColumns.target.column,
        value: event.data.target,
      },
    ];
  }

  return clickData;
};

export const useChartEvents = (
  chartRef: React.MutableRefObject<EChartsType | undefined>,
  sankeyColumns: SankeyChartColumns,
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
          const clickData = createSankeyClickData(
            event,
            sankeyColumns,
            rawSeries,
            settings,
          );
          onVisualizationClick?.(clickData);
        },
      },
    ],
    [sankeyColumns, onVisualizationClick, rawSeries, settings],
  );

  useClickedStateTooltipSync(chartRef.current, clicked);

  return {
    eventHandlers,
  };
};
