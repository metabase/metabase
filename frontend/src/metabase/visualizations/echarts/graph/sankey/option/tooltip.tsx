import type { TooltipOption } from "echarts/types/dist/shared";
import { renderToString } from "react-dom/server";

import { formatPercent } from "metabase/static-viz/lib/numbers";
import {
  EChartsTooltip,
  type EChartsTooltipRow,
} from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import { getTooltipBaseOption } from "metabase/visualizations/echarts/tooltip";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { DatasetColumn } from "metabase-types/api";

import type { SankeyFormatters } from "../model/types";

interface ChartItemTooltipProps {
  metricColumnKey: string;
  metricColumnName: string;
  formatters: SankeyFormatters;
  params: any;
}

const ChartItemTooltip = ({
  metricColumnKey,
  metricColumnName,
  formatters,
  params,
}: ChartItemTooltipProps) => {
  const data = params.data;

  let header = "";
  let rows: EChartsTooltipRow[] = [];
  if (params.dataType === "edge") {
    header = `${formatters.source(data.source)} → ${formatters.target(data.target)}`;
    const sourceValue = Math.max(
      data.sourceNode.inputColumnValues[metricColumnKey] ?? 0,
      data.sourceNode.outputColumnValues[metricColumnKey] ?? 0,
    );
    const sourcePercent = params.value / sourceValue;

    const targetValue = Math.max(
      data.targetNode.inputColumnValues[metricColumnKey] ?? 0,
      data.targetNode.outputColumnValues[metricColumnKey] ?? 0,
    );
    const targetPercent = params.value / targetValue;

    rows = [
      {
        name: metricColumnName,
        values: [formatters.value(params.value)],
      },
      {
        name: `% of ${formatters.source(data.source)}`,
        values: [formatPercent(sourcePercent)],
      },
      {
        name: `% of ${formatters.target(data.target)}`,
        values: [formatPercent(targetPercent)],
      },
    ];
  } else if (params.dataType === "node") {
    header = formatters.node(data);
    const nodeValue = Math.max(
      data.inputColumnValues[metricColumnKey] ?? 0,
      data.outputColumnValues[metricColumnKey] ?? 0,
    );
    rows = [
      {
        name: metricColumnName,
        values: [formatters.value(nodeValue)],
      },
    ];
  }

  return <EChartsTooltip header={header} rows={rows} />;
};

export const getTooltipOption = (
  containerRef: React.RefObject<HTMLDivElement>,
  metricColumn: DatasetColumn,
  formatters: SankeyFormatters,
): TooltipOption => {
  const metricColumnName = metricColumn.display_name;
  const metricColumnKey = getColumnKey(metricColumn);
  return {
    ...getTooltipBaseOption(containerRef),
    trigger: "item",
    triggerOn: "mousemove",
    formatter: params => {
      if (Array.isArray(params)) {
        return "";
      }

      return renderToString(
        <ChartItemTooltip
          params={params}
          metricColumnName={metricColumnName}
          metricColumnKey={metricColumnKey}
          formatters={formatters}
        />,
      );
    },
  };
};
