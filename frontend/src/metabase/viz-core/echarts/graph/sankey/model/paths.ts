import Color from "color";
import _ from "underscore";

import { color } from "metabase/ui/colors";
import { getColorsForValues } from "metabase/ui/colors/charts";
import type { DatasetColumn, RawSeries, RowValue } from "metabase-types/api";

import type { ComputedVisualizationSettings } from "../../../../types";

import { getSankeyBreakout } from "./breakout";
import {
  getConversionColor,
  getConversionScale,
  getSankeyConversion,
} from "./conversion";
import { getSankeyData } from "./dataset";
import { getSankeyFormatters } from "./formatters";
import type {
  SankeyChartColumns,
  SankeyChartModel,
  SankeyConversion,
  SankeyData,
  SankeyLink,
  SankeyNode,
} from "./types";

/** Columns a product analytics paths query returns beside source, target and value. */
export const PATHS_COLUMNS = {
  sourceLabel: "source_label",
  targetLabel: "target_label",
  targetKind: "target_kind",
} as const;

export type PathsColumns = typeof PATHS_COLUMNS;

export const PATH_NODE_KINDS = [
  /** An event. */
  "step",
  /** The events too small to show at a step, grouped. */
  "other",
  /** The steps a path took beyond the ones shown. */
  "more",
  /** Where a path ended without reaching its goal. */
  "dropped",
  /** Where a path reached its goal. */
  "converted",
] as const;

export type PathNodeKind = (typeof PATH_NODE_KINDS)[number];

const isPathNodeKind = (value: RowValue): value is PathNodeKind =>
  PATH_NODE_KINDS.some((kind) => kind === value);

const findColumnIndex = (cols: DatasetColumn[], name: string) => {
  const index = cols.findIndex((col) => col.name === name);
  return index >= 0 ? index : undefined;
};

// Hex drops alpha, so a translucent palette color is blended onto the background first.
const toOpaqueHex = (paletteColor: string) => {
  const parsed = Color(paletteColor);
  return Color(color("core-white")).mix(parsed.alpha(1), parsed.alpha()).hex();
};

/** The palette hook for paths colors, in hex so scale shades compare equal to their ends. */
export const getPathColors = () => ({
  neutral: toOpaqueHex(color("text-disabled")),
  converted: toOpaqueHex(color("feedback-positive")),
  dropped: toOpaqueHex(color("feedback-negative")),
});

const getNodeKinds = (
  rows: RowValue[][],
  sankeyColumns: SankeyChartColumns,
  kindIndex: number | undefined,
): Map<RowValue, PathNodeKind> => {
  const kinds = new Map<RowValue, PathNodeKind>();
  if (kindIndex === undefined) {
    return kinds;
  }
  rows.forEach((row) => {
    const kind = row[kindIndex];
    if (isPathNodeKind(kind)) {
      kinds.set(row[sankeyColumns.target.index], kind);
    }
  });
  return kinds;
};

// Where each kind sits in its column: outcomes at the edges, events in between.
const KIND_ORDER: Record<PathNodeKind, number> = {
  converted: 0,
  step: 1,
  other: 2,
  more: 3,
  dropped: 4,
};

const getLinkValue = ({ value }: SankeyLink) =>
  typeof value === "number" ? value : 0;

/**
 * The nodes column by column, each column by kind, then events from highest
 * to lowest conversion when there is one. Otherwise events go by the mean
 * position of where their flows come from, which keeps crossings down.
 */
const orderNodes = (
  data: SankeyData,
  kinds: Map<RowValue, PathNodeKind>,
  conversion: SankeyConversion | undefined,
): SankeyNode[] => {
  const incomingLinks = _.groupBy(data.links, (link) =>
    String(link.targetNode.rawName),
  );
  const outflowByNode = new Map<RowValue, number>();
  data.links.forEach((link) =>
    outflowByNode.set(
      link.sourceNode.rawName,
      (outflowByNode.get(link.sourceNode.rawName) ?? 0) + getLinkValue(link),
    ),
  );
  const positions = new Map<SankeyNode, number>();
  const levels = _.sortBy(_.uniq(data.nodes.map((node) => node.level)));

  return levels.flatMap((level) => {
    const column = data.nodes
      .filter((node) => node.level === level)
      .map((node) => {
        const links = incomingLinks[String(node.rawName)] ?? [];
        const inflow = links.reduce((sum, link) => sum + getLinkValue(link), 0);
        const weightedPosition = links.reduce(
          (sum, link) =>
            sum + (positions.get(link.sourceNode) ?? 0) * getLinkValue(link),
          0,
        );
        return {
          node,
          kindOrder: KIND_ORDER[kinds.get(node.rawName) ?? "step"],
          rate: conversion?.byNode.get(node.rawName)?.rate ?? 0,
          sourcePosition: inflow > 0 ? weightedPosition / inflow : 0,
          volume: Math.max(inflow, outflowByNode.get(node.rawName) ?? 0),
        };
      })
      .sort(
        (a, b) =>
          a.kindOrder - b.kindOrder ||
          b.rate - a.rate ||
          a.sourcePosition - b.sourcePosition ||
          b.volume - a.volume,
      );
    column.forEach(({ node }, index) => positions.set(node, index));
    return column.map(({ node }) => node);
  });
};

const isOutcomeKind = (kind: PathNodeKind) =>
  kind === "converted" || kind === "dropped";

/**
 * Conversion at each node, when the links are split by outcome. The links
 * into a converted node tell which breakout value means converting.
 */
const getConversion = (
  data: SankeyData,
  kinds: Map<RowValue, PathNodeKind>,
): SankeyConversion | undefined => {
  const convertedValue = data.links.find(
    (link) => kinds.get(link.targetNode.rawName) === "converted",
  )?.breakoutValue;
  if (convertedValue === undefined) {
    return undefined;
  }
  const colors = getPathColors();
  return {
    byNode: getSankeyConversion({
      data,
      convertedValue,
      isOutcome: (node) => isOutcomeKind(kinds.get(node.rawName) ?? "step"),
      colors,
    }),
    colors: getConversionScale(colors),
  };
};

const getNodeColors = (
  data: SankeyData,
  kinds: Map<RowValue, PathNodeKind>,
  hasBreakout: boolean,
  conversion: SankeyConversion | undefined,
): Record<string, string> => {
  const pathColors = getPathColors();
  const kindOf = (node: SankeyNode) => kinds.get(node.rawName) ?? "step";
  // Without a breakout, an event keeps one color at every step.
  const stepColors = getColorsForValues(
    _.uniq(
      data.nodes
        .filter((node) => kindOf(node) === "step")
        .map((node) => String(node.displayName)),
    ),
  );
  const getNodeColor = (node: SankeyNode): string => {
    const kind = kindOf(node);
    if (conversion !== undefined && !isOutcomeKind(kind)) {
      return getConversionColor(
        conversion.byNode.get(node.rawName)?.lift,
        pathColors,
      );
    }
    switch (kind) {
      case "step":
        return hasBreakout
          ? pathColors.neutral
          : stepColors[String(node.displayName)];
      case "other":
      case "more":
        return pathColors.neutral;
      case "dropped":
        return hasBreakout ? pathColors.dropped : pathColors.neutral;
      case "converted":
        return pathColors.converted;
    }
  };
  return Object.fromEntries(
    data.nodes.map((node) => [String(node.rawName), getNodeColor(node)]),
  );
};

/**
 * A sankey model for product analytics paths: nodes are labeled from the
 * label columns and colored by kind. With a breakout, the links carry the
 * colors and the nodes are neutral, except where paths end.
 */
export const getPathsSankeyChartModel = (
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  sankeyColumns: SankeyChartColumns,
): SankeyChartModel => {
  const [
    {
      data: { cols, rows },
    },
  ] = rawSeries;
  const sourceLabelIndex = findColumnIndex(cols, PATHS_COLUMNS.sourceLabel);
  const targetLabelIndex = findColumnIndex(cols, PATHS_COLUMNS.targetLabel);
  const kindIndex = findColumnIndex(cols, PATHS_COLUMNS.targetKind);
  const breakout = getSankeyBreakout(rawSeries, settings);

  const unorderedData = getSankeyData(rawSeries, sankeyColumns, {
    labelColumnIndexes:
      sourceLabelIndex !== undefined && targetLabelIndex !== undefined
        ? { source: sourceLabelIndex, target: targetLabelIndex }
        : undefined,
    breakout,
  });
  const kinds = getNodeKinds(rows, sankeyColumns, kindIndex);
  // Rates don't depend on the order, but each node's next steps are listed in it.
  const data = {
    ...unorderedData,
    nodes: orderNodes(
      unorderedData,
      kinds,
      getConversion(unorderedData, kinds),
    ),
  };
  const conversion = getConversion(data, kinds);

  return {
    data,
    formatters: getSankeyFormatters(sankeyColumns, settings),
    sankeyColumns,
    nodeColors: getNodeColors(data, kinds, breakout !== undefined, conversion),
    keepsNodeOrder: true,
    conversion,
  };
};
