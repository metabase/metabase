import type { TooltipOption } from "echarts/types/dist/shared";
import { renderToString } from "react-dom/server";
import { t } from "ttag";

import { formatPercent } from "metabase/static-viz/lib/numbers";
import {
  EChartsTooltip,
  type EChartsTooltipRow,
} from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import { getPercent } from "metabase/visualizations/components/ChartTooltip/StackedDataTooltip/utils";
import {
  getMarkerColorClass,
  getTooltipBaseOption,
} from "metabase/visualizations/echarts/tooltip";
import { getNumberOr } from "metabase/visualizations/lib/settings/row-values";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";

import type { SankeyChartModel } from "../model/types";

interface ChartItemTooltipProps {
  chartModel: SankeyChartModel;
  params: any;
}

const ChartItemTooltip = ({ chartModel, params }: ChartItemTooltipProps) => {
  const valueColumn = chartModel.sankeyColumns.value.column;
  const { formatters } = chartModel;
  const valueColumnKey = getColumnKey(valueColumn);

  const data = params.data;

  let header = "";
  let node = null;
  let rows: EChartsTooltipRow[] = [];
  let footer = undefined;

  if (params.dataType === "node") {
    node = chartModel.data.nodes.find(node => node.rawName === data.rawName)!;
    header = formatters.node(node);
  } else if (params.dataType === "edge") {
    node = chartModel.data.nodes.find(node => node.rawName === data.source)!;
    header = `${formatters.source(data.source)} → ${formatters.target(data.target)}`;
  }

  if (!node) {
    console.warn(`Node has not been found ${JSON.stringify(params)}`);
    return null;
  }

  const nodeValue = Math.max(
    getNumberOr(node.inputColumnValues[valueColumnKey], 0),
    getNumberOr(node.outputColumnValues[valueColumnKey], 0),
  );
  const formattedNodeValue = formatters.value(nodeValue);

  rows = Array.from(node.outputLinkByTarget.values()).map(link => {
    const color = chartModel.nodeColors[String(link.targetNode.rawName)];
    const isFocused = params.dataType === "edge" && data.target === link.target;
    return {
      isFocused,
      name: formatters.target(link.target),
      values: [
        formatters.value(link.value),
        formatPercent(getPercent(nodeValue, link.value) ?? 0),
      ],
      markerColorClass: getMarkerColorClass(color),
    };
  });

  const isEndNode = rows.length === 0;
  if (isEndNode) {
    rows = [
      {
        name: formatters.target(node.rawName),
        markerColorClass: getMarkerColorClass(
          chartModel.nodeColors[String(node.rawName)],
        ),
        values: [formattedNodeValue],
      },
    ];
  } else {
    footer = {
      name: t`Total`,
      values: [formattedNodeValue, formatPercent(1)],
    };
  }

  return <EChartsTooltip header={header} rows={rows} footer={footer} />;
};

export const getTooltipOption = (
  containerRef: React.RefObject<HTMLDivElement>,
  chartModel: SankeyChartModel,
): TooltipOption => {
  return {
    ...getTooltipBaseOption(containerRef),
    trigger: "item",
    triggerOn: "mousemove",
    formatter: params => {
      if (Array.isArray(params)) {
        return "";
      }

      return renderToString(
        <ChartItemTooltip params={params} chartModel={chartModel} />,
      );
    },
  };
};
