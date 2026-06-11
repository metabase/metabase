import { t } from "ttag";

import { formatPercent } from "metabase/static-viz/lib/numbers";
import { getTreemapNodeKey } from "metabase/visualizations/echarts/graph/treemap/model/data";
import type { TreemapTree } from "metabase/visualizations/echarts/graph/treemap/model/types";

/** Legend column width (px), from the Figma static-export spec. */
export const TREEMAP_LEGEND_WIDTH = 363;

/** Height (px) of a single legend row's text line. */
export const TREEMAP_LEGEND_ROW_HEIGHT = 16;

/** Vertical gap (px) between rows of the same group. */
export const TREEMAP_LEGEND_ROW_GAP = 12;

/** Vertical gap (px) between groups, and before the Total row. */
export const TREEMAP_LEGEND_GROUP_GAP = 24;

/** Gap (px) between the Total row's top border and its text line. */
export const TREEMAP_LEGEND_TOTAL_PADDING_TOP = 16;

/** Left indent (px) for leaf rows (and the Total row) in a 2-level legend. */
export const TREEMAP_LEGEND_INDENT = 18;

/** Diameter (px) of a parent row's color dot. */
export const TREEMAP_LEGEND_DOT_SIZE = 12;

/** Gap (px) between the color dot and the row name. */
export const TREEMAP_LEGEND_DOT_GAP = 6;

/** Width (px) of the right-aligned value column. */
export const TREEMAP_LEGEND_VALUE_WIDTH = 112;

/** Width (px) of the right-aligned percent column. */
export const TREEMAP_LEGEND_PERCENT_WIDTH = 52;

/** Gap (px) between the value and percent columns. */
export const TREEMAP_LEGEND_VALUE_PERCENT_GAP = 8;

/** Gap (px) reserved between the name column and the value/percent cluster. */
export const TREEMAP_LEGEND_NAME_CLUSTER_GAP = 16;

export const TREEMAP_LEGEND_FONT_SIZE = 14;

export interface TreemapLegendRow {
  /**
   * `"parent"` rows are bold with a color dot (2-level only); `"leaf"` rows are
   * regular weight — indented under their parent in a 2-level legend, flush
   * left in a 1-level one; `"total"` is the bold summary footer.
   */
  type: "parent" | "leaf" | "total";
  name: string;
  valueLabel: string;
  percentLabel: string;
  /** Dot color for parent rows; absent for leaf and total rows. */
  color?: string;
  /** Whether the row's name is indented (leaf/total rows of a 2-level legend). */
  indent: boolean;
  /** Y offset (px) of the row's text line top, relative to the legend top. */
  top: number;
}

export interface TreemapLegendModel {
  rows: TreemapLegendRow[];
  /** Total rendered height (px) of the legend column. */
  height: number;
}

/**
 * Lay out the static treemap legend: one group per top-level node — a bold
 * parent row (color dot, value, percent-of-whole) followed by its indented leaf
 * rows — and a Total footer. A 1-level tree (no children) renders as a flat
 * list of regular-weight rows with no dots or indentation, per the Figma
 * static-export spec.
 */
export function getTreemapLegendModel(
  tree: TreemapTree,
  colors: Record<string, string>,
  formatValue: (value: number) => string,
): TreemapLegendModel {
  const total = tree.reduce((sum, node) => sum + node.value, 0);
  const formatShare = (value: number) =>
    formatPercent(total === 0 ? 0 : value / total);
  const hasChildren = tree.some((node) => node.children != null);

  const rows: TreemapLegendRow[] = [];
  let top = 0;

  tree.forEach((node, index) => {
    if (index > 0) {
      // Replace the previous row's gap with the wider between-group one.
      top += TREEMAP_LEGEND_GROUP_GAP - TREEMAP_LEGEND_ROW_GAP;
    }
    rows.push({
      type: hasChildren ? "parent" : "leaf",
      name: node.displayName,
      valueLabel: formatValue(node.value),
      percentLabel: formatShare(node.value),
      ...(hasChildren ? { color: colors[getTreemapNodeKey(node)] } : {}),
      indent: false,
      top,
    });
    top += TREEMAP_LEGEND_ROW_HEIGHT + TREEMAP_LEGEND_ROW_GAP;

    node.children?.forEach((leaf) => {
      rows.push({
        type: "leaf",
        name: leaf.displayName,
        valueLabel: formatValue(leaf.value),
        percentLabel: formatShare(leaf.value),
        indent: true,
        top,
      });
      top += TREEMAP_LEGEND_ROW_HEIGHT + TREEMAP_LEGEND_ROW_GAP;
    });
  });

  if (rows.length > 0) {
    top += TREEMAP_LEGEND_GROUP_GAP - TREEMAP_LEGEND_ROW_GAP;
  }
  // The Total row's top border sits at `top`; its text line sits below the
  // border's padding.
  rows.push({
    type: "total",
    name: t`Total`,
    valueLabel: formatValue(total),
    percentLabel: formatPercent(1),
    indent: hasChildren,
    top: top + TREEMAP_LEGEND_TOTAL_PADDING_TOP,
  });
  top += TREEMAP_LEGEND_TOTAL_PADDING_TOP + TREEMAP_LEGEND_ROW_HEIGHT;

  return { rows, height: top };
}
