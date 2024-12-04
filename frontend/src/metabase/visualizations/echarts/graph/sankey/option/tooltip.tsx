import type { TooltipOption } from "echarts/types/dist/shared";
import { renderToString } from "react-dom/server";

import { EChartsTooltip } from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
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
  let value = null;
  if (params.dataType === "edge") {
    header = `${formatters.source(data.source)} → ${formatters.target(data.target)}`;
    value = params.value;
  } else if (params.dataType === "node") {
    header = formatters.node(data);
    value = Math.max(
      data.inputColumnValues[metricColumnKey] ?? 0,
      data.outputColumnValues[metricColumnKey] ?? 0,
    );
  }

  return (
    <EChartsTooltip
      header={header}
      rows={[
        {
          name: metricColumnName,
          values: [formatters.value(value)],
        },
      ]}
    />
  );
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
