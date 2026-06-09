import type { EChartsType } from "echarts/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import _ from "underscore";

import { formatPercent } from "metabase/static-viz/lib/numbers";
import { Box } from "metabase/ui";
import { extractRemappings } from "metabase/visualizations";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { getTreemapBreadcrumbModel } from "metabase/visualizations/echarts/graph/treemap/model/breadcrumb";
import { getTreemapColors } from "metabase/visualizations/echarts/graph/treemap/model/colors";
import {
  getTreemapChartColumns,
  getTreemapData,
} from "metabase/visualizations/echarts/graph/treemap/model/data";
import { getTreemapFormatters } from "metabase/visualizations/echarts/graph/treemap/model/formatters";
import type {
  TreemapLabelLayout,
  TreemapParentLabelLayout,
} from "metabase/visualizations/echarts/graph/treemap/model/labels";
import {
  MIN_FULL_LABEL_TILE_HEIGHT,
  MIN_LABEL_TILE_HEIGHT,
  MIN_LABEL_TILE_WIDTH,
  getTreemapLabelLayouts,
  getTreemapLayoutNodes,
  getTreemapParentLabelLayouts,
} from "metabase/visualizations/echarts/graph/treemap/model/labels";
import { getTreemapInlineValueIds } from "metabase/visualizations/echarts/graph/treemap/model/tooltip";
import { getTreemapChartOption } from "metabase/visualizations/echarts/graph/treemap/option/option";
import { getTreemapTooltipOption } from "metabase/visualizations/echarts/graph/treemap/option/tooltip";
import {
  TREEMAP_CHART_STYLE,
  groupHeader,
  leafBlock,
} from "metabase/visualizations/echarts/graph/treemap/style";
import {
  useCloseTooltipOnScroll,
  useInjectSeriesColorsClasses,
} from "metabase/visualizations/echarts/tooltip";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type { VisualizationProps } from "metabase/visualizations/types";

import { TreemapBreadcrumb } from "./TreemapBreadcrumb";
import S from "./TreemapChart.module.css";
import { TREEMAP_CHART_DEFINITION } from "./chart-definition";
import {
  type TreemapHoverOverlay,
  dispatchTreemapViewRoot,
  hideTreemapHoverOverlay,
  useChartEvents,
} from "./events";

// Inset from each tile edge, matching the option's `label.position` — the wrap
// width is the rendered tile width minus this on both sides.
const LABEL_PADDING = TREEMAP_CHART_STYLE.nodeLabels.position[0];

// Below this dashboard-grid size the group header chips are too cramped to be
// legible, so parent labels are hidden regardless of the setting. Only enforced
// when `gridSize` is present (dashboard/document); the query builder is unbounded.
const PARENT_LABEL_MIN_GRID_WIDTH = 12;
const PARENT_LABEL_MIN_GRID_HEIGHT = 8;

export const TreemapChart = ({
  rawSeries,
  settings,
  fontFamily,
  onVisualizationClick,
  isDashboard,
  isDocument,
  gridSize,
}: VisualizationProps) => {
  const rawSeriesWithRemappings = useMemo(
    () => extractRemappings(rawSeries),
    [rawSeries],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType>();
  const overlayRef = useRef<TreemapHoverOverlay | null>(null);
  // `null` = overview (initial 2-level view); `"0".."N-1"` = drilled into that
  // top-level group. The breadcrumb and the bottom inset render from
  // `viewRootId` state; the tooltip formatter reads the synced `viewRootIdRef`
  // live (its option is built once, so it can't close over state).
  // `handleViewRootChange` keeps both in sync.
  const [viewRootId, setViewRootId] = useState<string | null>(null);
  const viewRootIdRef = useRef<string | null>(null);
  // Per-leaf label layout (show + wrap width), derived from the rendered tile
  // sizes after each layout (the second pass — see `handleLabelMeasure`). Empty
  // until the first `finished`; the option builder falls back to its area-share
  // heuristic for any id not yet measured, so the first paint is sensible.
  const [labelLayout, setLabelLayout] = useState<
    Record<string, TreemapLabelLayout>
  >({});
  // Per-group header-text visibility, keyed by group node id, measured the same
  // way as `labelLayout` (second pass): per group, whether the header chip shows
  // its name text (too-narrow chips suppress it while keeping the band) and
  // whether it also shows the right-aligned value+percentage. Empty until the
  // first `finished`; missing ids default to showing the text.
  const [parentLabelLayout, setParentLabelLayout] = useState<
    Record<string, TreemapParentLabelLayout>
  >({});
  const handleViewRootChange = useCallback((id: string | null) => {
    viewRootIdRef.current = id;
    setViewRootId(id);
  }, []);

  const chartData = useMemo(() => {
    const cols = rawSeriesWithRemappings[0]?.data?.cols ?? [];
    const treemapColumns = getTreemapChartColumns(cols, settings);
    if (!treemapColumns) {
      return null;
    }
    const tree = getTreemapData(rawSeriesWithRemappings, treemapColumns);
    const colors = getTreemapColors(tree);
    return { tree, colors, treemapColumns };
  }, [rawSeriesWithRemappings, settings]);

  const renderingContext = useBrowserRenderingContext({ fontFamily });

  // Column-aware value/percent formatters, shared by the option builder, the
  // tooltip, and the label measurement pass (so the widths it measures match
  // what renders).
  const formatters = useMemo(
    () =>
      chartData
        ? getTreemapFormatters(chartData.treemapColumns, settings)
        : null,
    [chartData, settings],
  );

  // Cards smaller than 12×8 grid cells can't fit legible group headers, so hide
  // parent labels there even when the setting is on. Unbounded contexts (the
  // query builder) have no `gridSize` and are never restricted.
  const fitsParentLabels =
    gridSize == null ||
    (gridSize.width >= PARENT_LABEL_MIN_GRID_WIDTH &&
      gridSize.height >= PARENT_LABEL_MIN_GRID_HEIGHT);

  const option = useMemo(() => {
    if (!chartData || !formatters) {
      return null;
    }
    const { tree, colors, treemapColumns } = chartData;
    const seriesOption = getTreemapChartOption({
      tree,
      colors,
      isDrilled: viewRootId != null,
      showParentLabels:
        (settings["treemap.show_parent_labels"] ?? true) && fitsParentLabels,
      showLeafLabels: settings["treemap.show_leaf_labels"] ?? true,
      labelLayout,
      parentLabelLayout,
      formatValue: formatters.value,
      renderingContext,
    });

    return {
      ...seriesOption,
      tooltip: getTreemapTooltipOption(
        tree,
        colors,
        formatters.value,
        containerRef,
        () => viewRootIdRef.current,
        getTreemapInlineValueIds(labelLayout, parentLabelLayout),
        treemapColumns.grouping.column.display_name,
      ),
    };
  }, [
    chartData,
    formatters,
    settings,
    viewRootId,
    labelLayout,
    parentLabelLayout,
    renderingContext,
    fitsParentLabels,
  ]);

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
  }, []);

  const hasChildren = Boolean(
    chartData?.tree.some((node) => node.children != null),
  );
  const { eventHandlers } = useChartEvents({
    chartRef,
    overlayRef,
    hasChildren,
    isDrilled: viewRootId != null,
    onDrillToGroup: handleViewRootChange,
    tree: chartData?.tree ?? [],
    treemapColumns: chartData?.treemapColumns ?? null,
    rawSeries: rawSeriesWithRemappings,
    settings,
    onVisualizationClick,
  });

  // Second pass of the label layout: after ECharts finishes laying out (or
  // re-laying out on drill/resize), read each tile's rendered size and recompute
  // which labels show and how wide they wrap. Changing only `label.show`/`width`
  // never changes tile geometry, so the next `finished` reads identically — the
  // deep-equal guard returns the same state reference, React bails, and the loop
  // converges in one extra pass.
  const handleLabelMeasure = useCallback(() => {
    const chart = chartRef.current;
    const tree = chartData?.tree;
    if (!chart || !tree || !formatters) {
      return;
    }
    const nodes = getTreemapLayoutNodes(chart);

    // Resolve a node id ("i" group/1-level tile, "i-j" leaf) to its tree node.
    const getNode = (id: string) => {
      const [rootPart, leafPart] = id.split("-");
      const root = tree[Number(rootPart)];
      return leafPart == null ? root : root?.children?.[Number(leafPart)];
    };
    const total = tree.reduce((sum, node) => sum + node.value, 0);
    const formatShare = (value: number) =>
      formatPercent(total === 0 ? 0 : value / total);

    // Leaf tiles qualify for the "full" stacked block only when the value line
    // (the widest, at the H3 font) fits the tile width, so measure it at that
    // font. The value renders in the leaf-label font family (see the rich style
    // in `option.ts`), so measure with the same family.
    const nextLayout = getTreemapLabelLayouts(nodes, {
      minTileWidth: MIN_LABEL_TILE_WIDTH,
      minTileHeight: MIN_LABEL_TILE_HEIGHT,
      minFullTileHeight: MIN_FULL_LABEL_TILE_HEIGHT,
      padding: LABEL_PADDING,
      getValueLabelWidth: (id) => {
        const node = getNode(id);
        if (node == null) {
          return Infinity;
        }
        return renderingContext.measureText(formatters.value(node.value), {
          size: leafBlock.value.fontSize,
          family: TREEMAP_CHART_STYLE.nodeLabels.fontFamily,
          weight: leafBlock.value.fontWeight,
        });
      },
    });
    setLabelLayout((prev) => (_.isEqual(prev, nextLayout) ? prev : nextLayout));

    // Parent (group) header chips: a group node id is "0", "1", … — the index
    // into the top-level tree. Measure each header's name at the chip's font
    // style (too-narrow chips suppress the name); also measure the right-aligned
    // value+percentage cluster (value bold + gap + percent regular) so the chip
    // shows it only when there's room.
    const measureHeader = (text: string, weight: number) =>
      renderingContext.measureText(text, {
        size: groupHeader.fontSize,
        family: renderingContext.fontFamily,
        weight,
      });
    const nextParentLayout = getTreemapParentLabelLayouts(nodes, {
      getLabel: (id) => getNode(id)?.displayName,
      measureTextWidth: (text) => measureHeader(text, groupHeader.fontWeight),
      getValuePercentWidth: (id) => {
        const node = getNode(id);
        if (node == null) {
          return Infinity;
        }
        return (
          measureHeader(formatters.value(node.value), groupHeader.fontWeight) +
          groupHeader.valuePercentGap +
          measureHeader(formatShare(node.value), groupHeader.percentFontWeight)
        );
      },
      padding: groupHeader.paddingX,
    });
    setParentLabelLayout((prev) =>
      _.isEqual(prev, nextParentLayout) ? prev : nextParentLayout,
    );
  }, [chartData, formatters, renderingContext]);

  const allEventHandlers = useMemo(
    () => [
      ...eventHandlers,
      { eventName: "finished", handler: handleLabelMeasure },
    ],
    [eventHandlers, handleLabelMeasure],
  );

  // A new dataset re-renders the chart at the absolute root, so reset the
  // tracked view root to the overview and clear the measured label map (its ids
  // belong to the previous tree).
  useEffect(() => {
    handleViewRootChange(null);
    setLabelLayout({});
    setParentLabelLayout({});
  }, [chartData, handleViewRootChange]);

  // `setOption` (run by the renderer when `option` changes) always renders at
  // the absolute root, so after each change re-apply the drill for a drilled-in
  // view. This effect runs after the renderer's `setOption` effect (child
  // effects fire before parent effects). No canvas resize is involved, so the
  // layout stays clean. Also drop any stale hover overlay — its rect belongs to
  // the pre-change layout; the next `mouseover` re-adds it for the new view.
  useEffect(() => {
    hideTreemapHoverOverlay(chartRef, overlayRef);
    dispatchTreemapViewRoot(chartRef, viewRootId);
  }, [option, viewRootId]);

  const breadcrumb = chartData
    ? getTreemapBreadcrumbModel(chartData.tree, viewRootId)
    : null;

  const handleBreadcrumbBack = useCallback(() => {
    handleViewRootChange(null);
  }, [handleViewRootChange]);

  useCloseTooltipOnScroll(chartRef);

  // Dashboard cards and document embeds are tighter than the question builder, so
  // use a smaller, uniform padding there.
  const isCompact = isDashboard || isDocument;

  const colorsCss = useInjectSeriesColorsClasses(
    useMemo(() => Object.values(chartData?.colors ?? {}), [chartData]),
  );

  if (!option) {
    return null;
  }

  return (
    <Box w="100%" h="100%" display="flex" style={{ flexDirection: "column" }}>
      {breadcrumb && formatters && (
        <TreemapBreadcrumb
          groupLabel={breadcrumb.groupLabel}
          value={formatters.value(breadcrumb.value)}
          percent={formatPercent(1)}
          onBackClick={handleBreadcrumbBack}
        />
      )}
      <Box
        className={S.root}
        py={isCompact ? 24 : 32}
        px={isCompact ? 24 : 32}
        w="100%"
        style={{ flex: 1, minHeight: 0 }}
      >
        <ResponsiveEChartsRenderer
          ref={containerRef}
          option={option}
          eventHandlers={allEventHandlers}
          onInit={handleInit}
        />
        {colorsCss}
      </Box>
    </Box>
  );
};

Object.assign(TreemapChart, TREEMAP_CHART_DEFINITION);
