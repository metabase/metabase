import type { VisualizationGridSize } from "custom-viz";
import { match } from "ts-pattern";

import type { VisualizationProps } from "metabase/visualizations/types";

import { LABEL_PADDING, groupHeader } from "../style";

import type { TreemapLayoutNode } from "./types";

export const PARENT_MIN_HEADER_VISIBLE_CHARS = 3;
export const PARENT_HEADER_VALUE_PERCENT_GAP = 8;
const PARENT_LABEL_MIN_GRID_WIDTH = 12;
const PARENT_LABEL_MIN_GRID_HEIGHT = 8;

export type TreemapLabelDetail = "full" | "labelOnly" | "none";

export interface TreemapLabelLayout {
  detail: TreemapLabelDetail;
  width: number;
}

export function shouldShowParentLabels(
  gridSize: VisualizationGridSize | undefined,
  settings: VisualizationProps["settings"],
) {
  const fitsParentLabels =
    gridSize === undefined ||
    (gridSize.width >= PARENT_LABEL_MIN_GRID_WIDTH &&
      gridSize.height >= PARENT_LABEL_MIN_GRID_HEIGHT);

  return (settings["treemap.show_parent_labels"] ?? true) && fitsParentLabels;
}

export interface ParentLabelLayout {
  showText: boolean;
  showValuePercent: boolean;
  nameColumnWidth?: number;
}

export interface ParentLabelLayoutConfig {
  measureTextWidth: (text: string) => number;
  getLabel: (id: string) => string | undefined;
  getValuePercentWidth?: (id: string) => number;
}

export function getAllParentLabelLayouts(
  nodes: TreemapLayoutNode[],
  config: ParentLabelLayoutConfig,
): Record<string, ParentLabelLayout> {
  const layouts: Record<string, ParentLabelLayout> = {};
  for (const node of nodes) {
    if (node.isLeaf) {
      continue;
    }
    const label = config.getLabel(node.id);
    if (label == null) {
      continue;
    }
    const available = node.rect.width - groupHeader.paddingX * 2;
    const minReadable = label.slice(0, PARENT_MIN_HEADER_VISIBLE_CHARS);
    const minLabelWidth = config.measureTextWidth(minReadable);
    const fullLabelWidth = config.measureTextWidth(label);
    const showText = minLabelWidth <= available;
    let showValuePercent = false;
    let nameColumnWidth: number | undefined;
    if (showText) {
      const clusterWidth = config.getValuePercentWidth?.(node.id) ?? Infinity;

      showValuePercent =
        fullLabelWidth + PARENT_HEADER_VALUE_PERCENT_GAP + clusterWidth <=
        available;

      if (showValuePercent) {
        nameColumnWidth =
          available - PARENT_HEADER_VALUE_PERCENT_GAP - clusterWidth;
      }
    }
    layouts[node.id] = {
      showText,
      showValuePercent,
      nameColumnWidth,
    };
  }
  return layouts;
}

export const MIN_LABEL_TILE_WIDTH = 100;
export const MIN_LABEL_TILE_HEIGHT = 40;
export const MIN_FULL_LABEL_TILE_HEIGHT = 100;

export interface TileLabelLayoutsConfig {
  getValueLabelWidth?: (id: string) => number;
  showLeafLabels?: boolean;
}

interface GetTileLabelLayoutArgs {
  rect: { width: number; height: number };
  valueLabelWidth: number;
}

export function getAllTileLabelLayouts(
  nodes: TreemapLayoutNode[],
  {
    getValueLabelWidth = () => Infinity,
    showLeafLabels = true,
  }: TileLabelLayoutsConfig,
): Record<string, TreemapLabelLayout> {
  const layouts: Record<string, TreemapLabelLayout> = {};
  for (const node of nodes) {
    if (!node.isLeaf) {
      continue;
    }
    if (!showLeafLabels) {
      layouts[node.id] = {
        detail: "none",
        width: Math.max(0, node.rect.width - LABEL_PADDING * 2),
      };
      continue;
    }
    const fitsLabel =
      node.rect.width >= MIN_LABEL_TILE_WIDTH &&
      node.rect.height >= MIN_LABEL_TILE_HEIGHT;
    const fitsFull =
      fitsLabel && node.rect.height >= MIN_FULL_LABEL_TILE_HEIGHT;
    layouts[node.id] = getTileLabelLayout({
      rect: node.rect,
      valueLabelWidth: fitsFull ? getValueLabelWidth(node.id) : Infinity,
    });
  }
  return layouts;
}

export function getTileLabelLayout({
  rect,
  valueLabelWidth,
}: GetTileLabelLayoutArgs): TreemapLabelLayout {
  const innerWidth = Math.max(0, rect.width - LABEL_PADDING * 2);
  const fitsLabel =
    rect.width >= MIN_LABEL_TILE_WIDTH && rect.height >= MIN_LABEL_TILE_HEIGHT;
  const fitsFull =
    fitsLabel &&
    rect.height >= MIN_FULL_LABEL_TILE_HEIGHT &&
    innerWidth >= valueLabelWidth;

  const detail: TreemapLabelDetail = match({ fitsFull, fitsLabel })
    .with({ fitsFull: true }, () => "full" as const)
    .with({ fitsLabel: true }, () => "labelOnly" as const)
    .otherwise(() => "none");
  return { detail, width: innerWidth };
}
