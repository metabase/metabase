import { t } from "ttag";

import { formatPercent as formatPercentDefault } from "metabase/static-viz/lib/numbers";
import { getTreemapNodeKey } from "metabase/visualizations/echarts/graph/treemap/model/data";
import { getTreemapPercentOfTotalFormatter } from "metabase/visualizations/echarts/graph/treemap/model/formatters";
import { hasChildren } from "metabase/visualizations/echarts/graph/treemap/model/tree";
import type { TreemapTree } from "metabase/visualizations/echarts/graph/treemap/model/types";
import { getTreemapTotal } from "metabase/visualizations/echarts/graph/treemap/model/value";

export const LEGEND_WIDTH = 363;
export const ROW_HEIGHT = 16;
export const ROW_CENTER_Y = ROW_HEIGHT / 2;
export const GROUP_GAP = 24;
export const ROW_GAP = GROUP_GAP / 2;
export const PADDING_TOP = 16;
export const INDENT = 18;
export const DOT_SIZE = 12;
export const DOT_RADIUS = DOT_SIZE / 2;
export const DOT_GAP = 6;
export const VALUE_WIDTH = 112;
export const PERCENT_WIDTH = 52;
export const VALUE_PERCENT_GAP = 8;
export const NAME_CLUSTER_GAP = 16;
export const FONT_SIZE = 14;

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

  const stride = ROW_HEIGHT + GROUP_GAP;

  const rows: TreemapLegendRow[] = [...tree]
    .sort((a, b) => b.value - a.value)
    .map((node, index) => ({
      type: treeHasChildren ? "parent" : "leaf",
      name: node.displayName,
      valueLabel: formatValue(node.value),
      percentLabel: formatShare(node.value),
      indent: false,
      top: stride * index,
      ...(treeHasChildren ? { color: colors[getTreemapNodeKey(node)] } : {}),
    }));

  const totalRow: TreemapLegendRow = {
    type: "total",
    name: t`Total`,
    valueLabel: formatValue(total),
    percentLabel: formatPercent(1),
    indent: treeHasChildren,
    top: stride * rows.length + PADDING_TOP,
  };

  return {
    rows: [...rows, totalRow],
    height: totalRow.top + ROW_HEIGHT,
  };
}
