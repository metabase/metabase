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
import Question from "metabase-lib/v1/Question";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { Card, RawSeries, RowValue } from "metabase-types/api";

const getSankeyClickData = (
  [
    {
      data: { cols },
    },
  ]: RawSeries,
  columnValues: Record<ColumnKey, RowValue>,
) => {
  return cols.map((col) => {
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

const isNativeQuery = (card: Card) => {
  const question = new Question(card);
  return question.isNative();
};

export const createSankeyClickData = (
  event: EChartsSeriesMouseEvent<SankeyLink | SankeyNode>,
  sankeyColumns: SankeyChartColumns,
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
): ClickObject | null => {
  const clickData: ClickObject = {
    event: event.event.event,
    settings,
  };

  if (isSankeyNodeEvent(event)) {
    const source = sankeyColumns.source;
    const target = sankeyColumns.target;
    const columnValues = event.data.hasInputs
      ? event.data.inputColumnValues
      : event.data.outputColumnValues;

    clickData.column = event.data.hasInputs ? target.column : source.column;
    clickData.value = event.data.rawName;

    clickData.data = getSankeyClickData(rawSeries, columnValues);
  } else if (isSankeyEdgeEvent(event)) {
    clickData.data = getSankeyClickData(rawSeries, event.data.columnValues);
    if (!isNativeQuery(rawSeries[0].card)) {
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
  }

  return clickData;
};

export const useChartEvents = (
  chartRef: React.MutableRefObject<EChartsType | undefined>,
  sankeyColumns: SankeyChartColumns,
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  onVisualizationClick: VisualizationProps["onVisualizationClick"],
  clicked?: ClickObject | null,
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
