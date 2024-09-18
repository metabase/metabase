import type { TreemapSeriesOption } from "echarts";
import type { TooltipOption } from "echarts/types/dist/shared";

import { findWithIndex } from "metabase/lib/arrays";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RawSeries, RowValue, RowValues } from "metabase-types/api";

interface TreeNode {
  name: string;
  value: number;
  children: TreeNode[];
  childrenMap: Map<any, TreeNode>;
}

const buildTree = (
  rows: RowValues[],
  dimensions: any,
  metricIndex: number,
): TreeNode[] => {
  const root: TreeNode = {
    name: "Root",
    value: 0,
    children: [],
    childrenMap: new Map(),
  };

  rows.forEach((row: RowValues) => {
    let currentNode = root;
    const metricValue = row[metricIndex];

    if (typeof metricValue !== "number") {
      return; //throw new Error(`Treemap visualization requires a numerical metric.`);
    }

    dimensions.forEach((dimension: any) => {
      const value: RowValue = row[dimension.index];

      let node: TreeNode;
      if (currentNode.childrenMap.has(value)) {
        node = currentNode.childrenMap.get(value)!;
      } else {
        node = {
          name: String(value),
          value: 0,
          children: [],
          childrenMap: new Map(),
        };
        currentNode.children.push(node);
        currentNode.childrenMap.set(value, node);
      }

      node.value += metricValue;
      currentNode = node;
    });
  });

  // Remove the childrenMap property from all nodes to clean up the final output
  const clean = (node: any) => {
    delete node.childrenMap;
    if (node.children.length === 0) {
      delete node.children;
    } else {
      node.children.forEach((child: any) => clean(child));
    }
  };

  clean(root);
  return root.children;
};

export const buildTreemapOption = (
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
) => {
  const [{ data }] = rawSeries;

  const dimensions = settings["treemap.dimensions"].map((dimName: string) => {
    return findWithIndex(data.cols, col => col.name === dimName);
  });

  const metric = findWithIndex(
    data.cols,
    col => col.name === settings["treemap.metric"],
  );

  const echartsData = buildTree(data.rows, dimensions, metric.index);

  const treemapSeries: TreemapSeriesOption = {
    type: "treemap",
    name: "All",
    data: echartsData,
    roam: true,
    leafDepth: dimensions.length > 2 ? 1 : undefined,
    itemStyle: {
      gapWidth: 2,
    },
    levels: [
      {},
      {
        colorSaturation: [0.25, 0.65],
      },
      {},
    ],
  };

  const treemapTooltip: TooltipOption = {
    textStyle: {
      color: "white",
    },
    backgroundColor: "#2e353b",
    borderColor: "transparent",
    padding: 10,
    formatter: (info: any) => {
      // Build the breadcrumb by traversing ancestors
      const breadcrumb = info.treePathInfo
        .slice(1)
        .map((n: any) => n.name)
        .join(" > ");
      const value = info.data.value;

      return `${breadcrumb}<br/>Value: ${value}`;
    },
  };

  return {
    series: [treemapSeries],
    tooltip: treemapTooltip,
  };
};
