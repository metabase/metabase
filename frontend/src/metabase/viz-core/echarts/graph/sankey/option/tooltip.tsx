import type { TooltipOption } from "echarts/types/dist/shared";
import { t } from "ttag";
import _ from "underscore";

import { formatNumber, formatPercent } from "metabase/utils/formatting";
import { reactNodeToHtmlString } from "metabase/utils/react-to-html";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { RowValue } from "metabase-types/api";

import {
  EChartsTooltip,
  type EChartsTooltipProps,
  type EChartsTooltipRow,
} from "../../../../components/ChartTooltip/EChartsTooltip";
import { getNumberOr } from "../../../../lib/settings/row-values";
import { getMarkerColorClass, getTooltipBaseOption } from "../../../tooltip";
import { getPercent } from "../../../tooltip/utils";
import type {
  SankeyChartModel,
  SankeyNode,
  SankeyNodeConversion,
} from "../model/types";

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
    node = chartModel.data.nodes.find((node) => node.rawName === data.rawName)!;
    header = formatters.nodeLabel(node);
  } else if (params.dataType === "edge") {
    node = chartModel.data.nodes.find((node) => node.rawName === data.source)!;
    const targetNode = chartModel.data.nodes.find(
      (node) => node.rawName === data.target,
    );
    const headerSource = formatters.source(node?.displayName ?? data.source);
    const headerTarget = formatters.target(
      targetNode?.displayName ?? data.target,
    );
    header = `${headerSource} → ${headerTarget}`;
  }

  if (!node) {
    console.warn(`Node has not been found ${JSON.stringify(params)}`);
    return null;
  }

  const conversion = chartModel.conversion?.byNode.get(node.rawName);
  if (conversion !== undefined) {
    const focusedTarget = params.dataType === "edge" ? data.target : undefined;
    return (
      <EChartsTooltip
        header={header}
        {...getConversionRows(chartModel, node, conversion, focusedTarget)}
      />
    );
  }

  const nodeValue = Math.max(
    getNumberOr(node.inputColumnValues[valueColumnKey], 0),
    getNumberOr(node.outputColumnValues[valueColumnKey], 0),
  );
  const formattedNodeValue = formatters.value(nodeValue);

  const nodeOrder = new Map(
    chartModel.data.nodes.map((node, index) => [node, index]),
  );
  rows = _.sortBy(
    Array.from(node.outputLinkByTarget.values()),
    (link) => nodeOrder.get(link.targetNode) ?? 0,
  ).map((link) => {
    const color =
      link.color ?? chartModel.nodeColors[String(link.targetNode.rawName)];
    const isFocused =
      params.dataType === "edge" &&
      data.target === link.target &&
      data.breakoutValue === link.breakoutValue;
    const targetName = formatters.target(link.targetNode.displayName);
    return {
      isFocused,
      name:
        link.label !== undefined ? `${targetName} · ${link.label}` : targetName,
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
        name: formatters.target(node.displayName),
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

const formatConversionRate = (rate: number) =>
  t`${formatNumber(rate, { number_style: "percent", decimals: 1 })} converted`;

/**
 * Where people went next from a node, and how many of each went on to
 * convert. The footer compares the node with the rest of its step.
 */
export const getConversionRows = (
  chartModel: SankeyChartModel,
  node: SankeyNode,
  conversion: SankeyNodeConversion,
  focusedTarget: RowValue | undefined,
): Pick<EChartsTooltipProps, "rows" | "footer"> => {
  const { formatters } = chartModel;
  const total = {
    name:
      conversion.lift !== undefined
        ? t`Total · ${formatNumber(conversion.lift, { maximumFractionDigits: 1 })}× average`
        : t`Total`,
    values: [
      formatters.value(conversion.people),
      formatConversionRate(conversion.rate),
    ],
  };
  if (conversion.nextSteps.length === 0) {
    return {
      rows: [
        {
          name: formatters.nodeLabel(node),
          markerColorClass: getMarkerColorClass(
            chartModel.nodeColors[String(node.rawName)],
          ),
          values: total.values,
        },
      ],
    };
  }
  return {
    rows: conversion.nextSteps.map((step) => ({
      isFocused:
        focusedTarget !== undefined &&
        formatters.target(step.node.rawName) === focusedTarget,
      name: formatters.nodeLabel(step.node),
      markerColorClass: getMarkerColorClass(step.color),
      values: [formatters.value(step.people), formatConversionRate(step.rate)],
    })),
    footer: total,
  };
};

export const getTooltipOption = (
  containerRef: React.RefObject<HTMLDivElement | null>,
  chartModel: SankeyChartModel,
): TooltipOption => {
  return {
    ...getTooltipBaseOption(containerRef),
    trigger: "item",
    triggerOn: "mousemove",
    formatter: (params) => {
      if (Array.isArray(params)) {
        return "";
      }

      return reactNodeToHtmlString(
        <ChartItemTooltip params={params} chartModel={chartModel} />,
      );
    },
  };
};
