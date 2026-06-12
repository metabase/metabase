import type { VisualizationGridSize } from "custom-viz";
import { match } from "ts-pattern";

import type { VisualizationProps } from "metabase/visualizations/types";

import type { TreemapLayoutNode } from "./types";

export const MIN_LABEL_TILE_WIDTH = 100;
export const MIN_LABEL_TILE_HEIGHT = 40;
export const MIN_FULL_LABEL_TILE_HEIGHT = 100;

export type TreemapLabelDetail = "full" | "labelOnly" | "none";

export interface TreemapLabelLayout {
  show: boolean;
  detail: TreemapLabelDetail;
  width: number;
}

export interface TreemapLabelLayoutConfig {
  minTileWidth: number;
  minTileHeight: number;
  minFullTileHeight: number;
  padding: number;
}

export function getTreemapLabelLayout(
  rect: { width: number; height: number },
  valueLabelWidth: number,
  {
    minTileWidth,
    minTileHeight,
    minFullTileHeight,
    padding,
  }: TreemapLabelLayoutConfig,
): TreemapLabelLayout {
  const innerWidth = Math.max(0, rect.width - padding * 2);
  const fitsLabel = rect.width >= minTileWidth && rect.height >= minTileHeight;
  const fitsFull =
    fitsLabel &&
    rect.height >= minFullTileHeight &&
    innerWidth >= valueLabelWidth;
  const detail: TreemapLabelDetail = match({ fitsFull, fitsLabel })
    .with({ fitsFull: true }, () => "full" as const)
    .with({ fitsLabel: true }, () => "labelOnly" as const)
    .otherwise(() => "none");
  return { show: detail !== "none", detail, width: innerWidth };
}

export interface TreemapLabelLayoutsConfig extends TreemapLabelLayoutConfig {
  getValueLabelWidth?: (id: string) => number;
}

export function getTreemapLabelLayouts(
  nodes: TreemapLayoutNode[],
  { getValueLabelWidth = () => Infinity, ...config }: TreemapLabelLayoutsConfig,
): Record<string, TreemapLabelLayout> {
  const layouts: Record<string, TreemapLabelLayout> = {};
  for (const node of nodes) {
    if (!node.isLeaf) {
      continue;
    }
    layouts[node.id] = getTreemapLabelLayout(
      node.rect,
      getValueLabelWidth(node.id),
      config,
    );
  }
  return layouts;
}

export const MIN_HEADER_VISIBLE_CHARS = 3;
export const HEADER_VALUE_PERCENT_GAP = 8;

export interface TreemapParentLabelLayout {
  showText: boolean;
  showValuePercent: boolean;
  nameColumnWidth?: number;
}

export interface TreemapParentLabelLayoutConfig {
  measureTextWidth: (text: string) => number;
  getLabel: (id: string) => string | undefined;
  padding: number;
  minVisibleChars?: number;
  getValuePercentWidth?: (id: string) => number;
  valuePercentGap?: number;
}

export function getTreemapParentLabelLayouts(
  nodes: TreemapLayoutNode[],
  {
    measureTextWidth,
    getLabel,
    padding,
    minVisibleChars = MIN_HEADER_VISIBLE_CHARS,
    getValuePercentWidth = () => Infinity,
    valuePercentGap = HEADER_VALUE_PERCENT_GAP,
  }: TreemapParentLabelLayoutConfig,
): Record<string, TreemapParentLabelLayout> {
  const layouts: Record<string, TreemapParentLabelLayout> = {};
  for (const node of nodes) {
    if (node.isLeaf) {
      continue;
    }
    const label = getLabel(node.id);
    if (label == null) {
      continue;
    }
    const available = node.rect.width - padding * 2;
    // Require only a readable prefix to fit, not the whole label — ECharts
    // truncates the rest with an ellipsis.
    const minReadable = label.slice(0, minVisibleChars);
    const minReadableWidth = measureTextWidth(minReadable);
    const showText = minReadableWidth <= available;
    const clusterWidth = getValuePercentWidth(node.id);
    const showValuePercent =
      showText &&
      minReadableWidth + valuePercentGap + clusterWidth <= available;
    layouts[node.id] = {
      showText,
      showValuePercent,
      // The name column takes the slack so the cluster sits flush right; only
      // meaningful when the cluster renders.
      ...(showValuePercent
        ? { nameColumnWidth: available - valuePercentGap - clusterWidth }
        : {}),
    };
  }
  return layouts;
}

export function shouldShowParentLabels(
  gridSize: VisualizationGridSize | undefined,
  settings: VisualizationProps["settings"],
) {
  const PARENT_LABEL_MIN_GRID_WIDTH = 12;
  const PARENT_LABEL_MIN_GRID_HEIGHT = 8;

  const fitsParentLabels =
    gridSize === undefined ||
    (gridSize.width >= PARENT_LABEL_MIN_GRID_WIDTH &&
      gridSize.height >= PARENT_LABEL_MIN_GRID_HEIGHT);

  return (settings["treemap.show_parent_labels"] ?? true) && fitsParentLabels;
}
