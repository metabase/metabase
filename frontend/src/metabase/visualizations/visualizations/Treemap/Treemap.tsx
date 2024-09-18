import { t } from "ttag";
import _ from "underscore";

import { findWithIndex } from "metabase/lib/arrays";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import {
  getOptionFromColumn,
  metricSetting,
} from "metabase/visualizations/lib/settings/utils";
import { getDefaultDimensionsAndMetrics } from "metabase/visualizations/lib/utils";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { RawSeries, RowValue, RowValues } from "metabase-types/api";

const MAX_TREEMAP_DIMENSIONS = 100;

// Defines supported visualization settings
const SETTING_DEFINITIONS = {
  // Column formatting settings
  ...columnSettings({ hidden: true }),
  // Treemap dimensions
  "treemap.dimensions": {
    section: t`Data`,
    title: t`Dimensions`,
    widget: "fields",
    getDefault: (rawSeries: RawSeries) =>
      getDefaultDimensionsAndMetrics(rawSeries, MAX_TREEMAP_DIMENSIONS, 1)
        .dimensions,
    persistDefault: true,
    getProps: ([{ data }]: any) => {
      const options = data.cols.map(getOptionFromColumn);
      return {
        options,
        addAnother: true,
        columns: data.cols,
      };
    },
  },

  // Heatmap metric column
  ...metricSetting("treemap.metric", {
    section: t`Data`,
    title: t`Measure`,
    showColumnSetting: true,
  }),
};

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
      throw new Error(t`Treemap visualization requires a numerical metric.`);
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

export const Treemap = ({ rawSeries, settings }: VisualizationProps) => {
  // console.log(rawSeries);

  const [{ data }] = rawSeries;

  const dimensions = settings["treemap.dimensions"].map((dimName: string) => {
    return findWithIndex(data.cols, col => col.name === dimName);
  });

  const metric = findWithIndex(
    data.cols,
    col => col.name === settings["treemap.metric"],
  );

  const echartsData = buildTree(data.rows, dimensions, metric.index);

  const option = {
    series: [
      {
        type: "treemap",
        name: "All",
        data: echartsData,
      },
    ],
  };

  return <ResponsiveEChartsRenderer option={option} />;
};

Object.assign(Treemap, {
  uiName: t`Treemap`,
  identifier: "treemap",
  iconName: "treemap",
  noun: t`Treemap`,
  settings: SETTING_DEFINITIONS,
});
