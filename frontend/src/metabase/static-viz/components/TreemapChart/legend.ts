import { t } from "ttag";

import { formatPercent as formatPercentDefault } from "metabase/static-viz/lib/numbers";
import { getTreemapNodeKey } from "metabase/visualizations/echarts/graph/treemap/model/data";
import { getTreemapPercentOfTotalFormatter } from "metabase/visualizations/echarts/graph/treemap/model/formatters";
import { hasChildren } from "metabase/visualizations/echarts/graph/treemap/model/tree";
import type { TreemapTree } from "metabase/visualizations/echarts/graph/treemap/model/types";
import { getTreemapTotal } from "metabase/visualizations/echarts/graph/treemap/model/value";

export const TREEMAP_LEGEND_WIDTH = 363;
export const TREEMAP_LEGEND_ROW_HEIGHT = 16;
export const TREEMAP_LEGEND_GROUP_GAP = 24;
export const TREEMAP_LEGEND_ROW_GAP = TREEMAP_LEGEND_GROUP_GAP / 2;
export const TREEMAP_LEGEND_TOTAL_PADDING_TOP = 16;
export const TREEMAP_LEGEND_INDENT = 18;
export const TREEMAP_LEGEND_DOT_SIZE = 12;
export const TREEMAP_LEGEND_DOT_GAP = 6;
export const TREEMAP_LEGEND_VALUE_WIDTH = 112;
export const TREEMAP_LEGEND_PERCENT_WIDTH = 52;
export const TREEMAP_LEGEND_VALUE_PERCENT_GAP = 8;
export const TREEMAP_LEGEND_NAME_CLUSTER_GAP = 16;
export const TREEMAP_LEGEND_FONT_SIZE = 14;

export interface TreemapLegendRow {
  type: "parent" | "leaf" | "total";
  name: string;
  valueLabel: string;
  percentLabel: string;
  color?: string;
  indent: boolean;
  top: number;
}

export interface TreemapLegendModel {
  rows: TreemapLegendRow[];
  height: number;
}

export function getTreemapLegendModel(
  tree: TreemapTree,
  colors: Record<string, string>,
  formatValue: (value: number) => string,
  formatPercent: (ratio: number) => string = formatPercentDefault,
): TreemapLegendModel {
  const total = getTreemapTotal(tree);
  const formatShare = getTreemapPercentOfTotalFormatter(tree, formatPercent);
  const treeHasChildren = tree.some(hasChildren);

  const stride = TREEMAP_LEGEND_ROW_HEIGHT + TREEMAP_LEGEND_GROUP_GAP;

  const rows: TreemapLegendRow[] = [...tree]
    .sort((a, b) => b.value - a.value)
    .map((node, index) => ({
      type: treeHasChildren ? "parent" : "leaf",
      name: node.displayName,
      valueLabel: formatValue(node.value),
      percentLabel: formatShare(node.value),
      ...(treeHasChildren ? { color: colors[getTreemapNodeKey(node)] } : {}),
      indent: false,
      top: stride * index,
    }));

  const totalRow: TreemapLegendRow = {
    type: "total",
    name: t`Total`,
    valueLabel: formatValue(total),
    percentLabel: formatPercent(1),
    indent: treeHasChildren,
    top: stride * rows.length + TREEMAP_LEGEND_TOTAL_PADDING_TOP,
  };

  return {
    rows: [...rows, totalRow],
    height: totalRow.top + TREEMAP_LEGEND_ROW_HEIGHT,
  };
}
