import { sumMetric } from "metabase/visualizations/lib/dataset";
import { getColumnDescriptors } from "metabase/visualizations/lib/graph/columns";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { DatasetColumn, RawSeries, RowValue } from "metabase-types/api";

import { NULL_CHAR } from "../../../cartesian/constants/dataset";

import type {
  SankeyChartColumns,
  SankeyData,
  SankeyLink,
  SankeyNode,
} from "./types";

export const getSankeyChartColumns = <TColumn extends DatasetColumn>(
  columns: TColumn[],
  settings: ComputedVisualizationSettings,
): SankeyChartColumns | null => {
  if (
    settings["sankey.source"] == null ||
    settings["sankey.target"] == null ||
    settings["sankey.value"] == null
  ) {
    return null;
  }

  const source = getColumnDescriptors([settings["sankey.source"]], columns)[0];
  const target = getColumnDescriptors([settings["sankey.target"]], columns)[0];
  const value = getColumnDescriptors([settings["sankey.value"]], columns)[0];

  if (!source || !target || !value) {
    return null;
  }

  return {
    source,
    target,
    value,
  };
};

export const getSankeyData = (
  rawSeries: RawSeries,
  sankeyColumns: SankeyChartColumns,
): SankeyData => {
  const [
    {
      data: { rows },
    },
  ] = rawSeries;

  const valueToNodeInfo = new Map<RowValue, SankeyNode>();

  function updateNodeInfo(
    value: RowValue,
    level: number,
    type: "source" | "target",
  ): SankeyNode {
    const nodeInfo = valueToNodeInfo.get(value) ?? {
      value,
      level,
      hasInputs: false,
      hasOutputs: false,
    };

    nodeInfo.level = Math.max(nodeInfo.level, level);
    nodeInfo.hasInputs = nodeInfo.hasInputs || type === "target";
    nodeInfo.hasOutputs = nodeInfo.hasOutputs || type === "source";

    valueToNodeInfo.set(value, nodeInfo);
    return nodeInfo;
  }

  const linkMap = new Map<string, SankeyLink>();

  rows.forEach(row => {
    const source = row[sankeyColumns.source.index];
    const target = row[sankeyColumns.target.index];
    const value = row[sankeyColumns.value.index];

    const sourceInfo = updateNodeInfo(source, 0, "source");
    updateNodeInfo(target, sourceInfo.level + 1, "target");

    const linkKey = `${NULL_CHAR}${source}->${target}`;

    const existingLink = linkMap.get(linkKey);
    if (existingLink == null) {
      linkMap.set(linkKey, {
        source,
        target,
        value,
      });
    } else {
      existingLink.value = sumMetric(existingLink.value, value);
    }
  });

  return {
    nodes: Array.from(valueToNodeInfo.values()),
    links: Array.from(linkMap.values()),
  };
};
