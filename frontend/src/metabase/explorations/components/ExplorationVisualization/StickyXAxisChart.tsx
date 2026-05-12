import type { EChartsCoreOption } from "echarts/core";
import { useMemo } from "react";

import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import type { SingleSeries } from "metabase-types/api";

interface StickyXAxisChartProps {
  /**
   * The combined chart's `rawSeries`. Used as a fallback to seed a
   * "ghost" series with the union of all x-values across queries so
   * ECharts has something to anchor tick spacing to. The
   * `xAxisExtent` prop, when present, takes precedence over any
   * auto-range derived from this data.
   */
  series: SingleSeries[];
  /**
   * The main chart's currently-rendered x-axis option, captured via
   * `echarts.getInstanceByDom(...).getOption()`. When present, the
   * sticky chart copies this verbatim (minus `gridIndex`) so the
   * font, tick formatter, axis title, and label rotation match the
   * main chart exactly. Optional because the snapshot is read AFTER
   * the main chart mounts.
   */
  xAxisOption?: Record<string, unknown> | null;
  /**
   * The resolved `[min, max]` of the main chart's x-axis scale,
   * pulled from ECharts via `instance.getModel().getComponent(...)`.
   * Pinned explicitly on the sticky chart so its axis range matches
   * the main chart's — particularly important when the main chart
   * pads its range (e.g. numeric axes), or when individual queries
   * cover narrower x-domains than the chart's overall extent.
   */
  xAxisExtent?: [number, number] | null;
  /**
   * The exact category list from the main chart's axis (read via
   * `axisModel.getCategories(true)`). For category x-axes
   * (histograms), this is the authoritative source for the bin
   * positions — it includes empty bins and any non-uniform spacing
   * that we can't reconstruct from the series rows alone (e.g.
   * histogram extreme-value handling where the first bin is wider
   * than the rest).
   */
  xAxisCategories?: (number | string)[] | null;
  /**
   * The axis title text. When the sticky is active the main chart's
   * `graph.x_axis.labels_enabled` is forced off so we don't render
   * a duplicate title under the main chart — which means
   * `xAxisOption.name` is `undefined` on the snapshot. The parent
   * captures the title from the first snapshot and passes it here
   * so the sticky can still render it.
   */
  xAxisTitle?: string | null;
  /**
   * The main chart's computed `grid.left` (y-axis label gutter
   * width). Mirroring it on the sticky chart aligns the x-axis tick
   * positions under the panel data area.
   */
  gridLeft?: number | string | null;
  /**
   * The main chart's computed `grid.right` — mirrored for the same
   * reason as `gridLeft`.
   */
  gridRight?: number | string | null;
}

// Fallback constants used only on first paint, before the main chart's
// option snapshot lands.
const FALLBACK_GRID_LEFT_PX = 60;
const FALLBACK_GRID_RIGHT_PX = 30;
// The sticky chart's ECharts grid is collapsed to a 1-pixel strip at
// the top of the canvas: `grid.top = 0`, and `grid.bottom` is set so
// the grid has effectively zero height. ECharts' bottom-positioned
// x-axis renders its axis line at the grid's bottom edge, with tick
// labels and the axis name BELOW that line. By placing the grid
// essentially at y=0 we put the axis line right at the top of the
// sticky container — so the labels and title use the remaining
// vertical space and there's no empty "plot area" between the main
// chart's content above and the sticky's axis line.
const AXIS_TOP_PX = 0;
const GRID_HEIGHT_PX = 1;
// Distance from the axis line down to the title text. The main
// chart's snapshot carries `nameGap: 30`, which is calibrated for
// its taller layout (the title is anchored relative to the LAST
// grid in a tall split-panels chart) and ends up overlapping the
// tick-label row when reused in our short sticky chart. Bump to
// ~45 so the title clears the labels.
const STICKY_NAME_GAP_PX = 45;

/**
 * Axis-only ECharts instance — renders just the x-axis with the same
 * configuration as the main combined chart's last (visible) x-axis.
 * Designed to be pinned at the bottom of a scrolling combined-chart
 * container so the x-axis stays visible regardless of scroll position.
 *
 * The dimension column (first column of the dataset) is assumed to be
 * a time/date column or a numeric dimension — both are supported by
 * the cartesian `page` group flow.
 */
export function StickyXAxisChart({
  series,
  xAxisOption,
  xAxisExtent,
  xAxisCategories,
  xAxisTitle,
  gridLeft,
  gridRight,
}: StickyXAxisChartProps) {
  const option = useMemo<EChartsCoreOption | null>(() => {
    const firstSeries = series[0];
    if (!firstSeries) {
      return null;
    }

    // Build the xAxis: if we have a snapshot from the main chart, copy
    // it verbatim and re-target it to our single grid (`gridIndex: 0`).
    // When we also have a resolved `[min, max]`, override `min`/`max`
    // on the copied axis so the sticky chart's range matches the main
    // chart's regardless of padding, function-typed min/max in the
    // snapshot, or any auto-range divergence from the ghost series.
    const xAxis: Record<string, unknown> = xAxisOption
      ? { ...xAxisOption, gridIndex: 0 }
      : {
          type: "time",
          axisLine: { show: true },
          axisTick: { show: true },
          axisLabel: { show: true },
        };
    if (xAxisExtent) {
      // Pin the sticky chart's range to the main chart's actual
      // post-layout extent (read via `axis.getExtent()` upstream).
      // The cartesian builder writes function-typed `min`/`max`
      // closures for numeric padded axes — those closures evaluate
      // to a NARROWER range than ECharts ultimately renders (because
      // ECharts itself applies additional `scale: true` niceness on
      // top). Using the rendered extent makes the sticky axis ticks
      // align with the main chart's, including the bin-edge ticks
      // at either end.
      xAxis.min = xAxisExtent[0];
      xAxis.max = xAxisExtent[1];
    }

    // The parent disables `graph.x_axis.axis_enabled` and
    // `graph.x_axis.labels_enabled` on the main chart when the
    // sticky is active (so we don't double up the axis). That sets
    // `axisLabel.show: false`, `axisLine.show: false`, and clears
    // `name` on the copied option. Force them back on here so the
    // sticky still renders a full axis.
    const existingAxisLabel = (xAxis.axisLabel ?? {}) as Record<
      string,
      unknown
    >;
    xAxis.axisLabel = { ...existingAxisLabel, show: true };
    const existingAxisLine = (xAxis.axisLine ?? {}) as Record<string, unknown>;
    xAxis.axisLine = { ...existingAxisLine, show: true };
    if (!xAxis.name && xAxisTitle) {
      xAxis.name = xAxisTitle;
    }
    // Override the snapshot's `nameGap` (calibrated for the main
    // chart's taller layout) with a value sized for the sticky's
    // short canvas, so the axis title sits below the tick labels
    // instead of overlapping them.
    xAxis.nameGap = STICKY_NAME_GAP_PX;

    // Build the category/value list the sticky chart will use for
    // its ghost series. Prefer the authoritative list from the main
    // chart's axis model (`xAxisCategories`, read via
    // `axisModel.getCategories(true)` upstream) — that's the only
    // way to reproduce empty bins and non-uniform binning (e.g.
    // histogram extreme-value handling that widens the first bin).
    //
    // If we don't have it yet (snapshot not landed), fall back to
    // the union of dim values across the series' rows so the chart
    // at least has SOMETHING to anchor the axis to during the
    // first paint.
    let dedupedDimValues: (number | string)[];
    if (xAxisCategories && xAxisCategories.length > 0) {
      dedupedDimValues = xAxisCategories;
    } else {
      const dimSet = new Set<number | string>();
      for (const s of series) {
        for (const row of s.data.rows) {
          const v = row[0] as number | string | null;
          if (v != null) {
            dimSet.add(v);
          }
        }
      }
      dedupedDimValues = Array.from(dimSet).sort((a, b) => {
        if (typeof a === "number" && typeof b === "number") {
          return a - b;
        }
        return String(a).localeCompare(String(b));
      });
    }

    const ghostSeries = {
      type: "line" as const,
      data: dedupedDimValues.map((v) => [v, 0]),
      symbol: "none",
      lineStyle: { opacity: 0 },
      silent: true,
    };
    // For `type: "category"` axes, also pin the explicit category
    // list on the axis itself so ECharts doesn't fall back to
    // deriving it from `series.data` (which can differ if the data
    // doesn't contain rows for every bin).
    if (xAxis.type === "category" && !xAxis.data) {
      xAxis.data = dedupedDimValues;
    }

    return {
      // Match the main cartesian chart's `useUTC: true` setting.
      // Time axes in ECharts pick tick boundaries at LOCAL midnight
      // by default, but Metabase's cartesian builder enables
      // `useUTC` so ticks land at UTC midnight. Without this on the
      // sticky chart, ticks shift by the browser's TZ offset (e.g.
      // 3 h in UTC+3), which moves every label a few pixels left.
      useUTC: true,
      animation: false,
      grid: {
        left: gridLeft ?? FALLBACK_GRID_LEFT_PX,
        right: gridRight ?? FALLBACK_GRID_RIGHT_PX,
        top: AXIS_TOP_PX,
        height: GRID_HEIGHT_PX,
        containLabel: false,
      },
      xAxis,
      yAxis: {
        type: "value",
        show: false,
      },
      series: [ghostSeries],
    };
  }, [
    series,
    xAxisOption,
    xAxisExtent,
    xAxisCategories,
    xAxisTitle,
    gridLeft,
    gridRight,
  ]);

  if (!option) {
    return null;
  }

  // ResponsiveEChartsRenderer is wrapped in `ExplicitSize` and supplies
  // its own measured width/height — the parent just needs a concrete
  // size (we pin it in `ExplorationGroupVisualization`).
  return <ResponsiveEChartsRenderer option={option} />;
}
