import { getInstanceByDom } from "echarts/core";
import { useEffect, useRef, useState } from "react";

/**
 * Snapshot of the visible state of the main cartesian chart's last
 * x-axis — used by the sticky-axis chart to mirror the main chart's
 * tick formatter, font, grid alignment, and value extent.
 */
export interface MainChartAxisSnapshot {
  /**
   * The main chart's `xAxis[last]` option object captured verbatim
   * from `echarts.getInstanceByDom(...).getOption()`. The sticky
   * chart spreads this onto its own xAxis so font, tick formatter,
   * boundary gap, etc. match the main chart pixel-for-pixel.
   */
  xAxis: Record<string, unknown> | null;
  /**
   * Authoritative `[min, max]` of the main chart's x-axis in DATA
   * space (read from `axis.scale.getExtent()`). Pinning this on the
   * sticky chart's `xAxis.min`/`max` keeps the axis range identical
   * even when the option snapshot carries function-typed bounds or
   * has any `scale: true` niceness applied by ECharts internally.
   */
  xAxisExtent: [number, number] | null;
  /**
   * For category x-axes (histograms), the actual list of categories
   * ECharts assigned to the axis — including empty bins and any
   * non-uniform first-bin spacing that we can't reconstruct from
   * the series rows alone.
   */
  xAxisCategories: (number | string)[] | null;
  /**
   * Post-layout `grid.left` value from the main chart. Mirroring it
   * on the sticky chart's grid is what keeps tick x-positions
   * aligned across the two ECharts canvases.
   */
  gridLeft: number | string | null;
  /**
   * Post-layout `grid.right` value — mirrored for the same reason
   * as `gridLeft`.
   */
  gridRight: number | string | null;
}

const EMPTY_SNAPSHOT: MainChartAxisSnapshot = {
  xAxis: null,
  xAxisExtent: null,
  xAxisCategories: null,
  gridLeft: null,
  gridRight: null,
};

/**
 * Watches the main cartesian chart (rendered via Metabase's
 * `<Visualization>`) and exposes a snapshot of its last x-axis state
 * — used by `<StickyXAxisChart>` to reproduce the axis pixel-for-pixel
 * in a sticky footer.
 *
 * Returns a ref to attach to the main chart's container `<div>` and
 * the current snapshot. The hook polls via `requestAnimationFrame`
 * until ECharts has mounted, then subscribes to the chart's
 * `finished` event so it re-snapshots whenever the chart re-renders
 * (resize, data change, etc.).
 *
 * @param enabled - When `false`, the hook is a no-op (used to skip
 *   the work on non-cartesian display types). The hook still
 *   returns a stable ref so the consumer can pass it down
 *   unconditionally.
 * @param resetKey - Any value that should force the hook to
 *   re-attach to a new chart instance. Pass the `series` array so
 *   the listener resets when the data changes and the chart
 *   re-mounts.
 */
export function useMainChartAxisSnapshot(
  enabled: boolean,
  resetKey: unknown,
): {
  mainChartContainerRef: React.RefObject<HTMLDivElement>;
  mainChartAxisSnapshot: MainChartAxisSnapshot;
} {
  const mainChartContainerRef = useRef<HTMLDivElement>(null);
  const [mainChartAxisSnapshot, setMainChartAxisSnapshot] =
    useState<MainChartAxisSnapshot>(EMPTY_SNAPSHOT);

  useEffect(() => {
    if (!enabled || resetKey == null) {
      return;
    }
    let cancelled = false;
    let rafId: number | null = null;
    let attachedInstance: ReturnType<typeof getInstanceByDom> | null = null;
    let detachListener: (() => void) | null = null;

    const readAxis = () => {
      if (cancelled) {
        return;
      }
      const container = mainChartContainerRef.current?.querySelector(
        '[data-testid="chart-container"]',
      ) as HTMLElement | null;
      if (!container) {
        rafId = requestAnimationFrame(readAxis);
        return;
      }
      const instance = getInstanceByDom(container);
      if (!instance) {
        rafId = requestAnimationFrame(readAxis);
        return;
      }
      // Re-snapshot whenever the main chart finishes a render pass
      // — covers width changes (resizes) and any re-renders
      // triggered by series/option swaps that shift the tick
      // layout.
      if (attachedInstance !== instance) {
        if (attachedInstance && detachListener) {
          detachListener();
        }
        attachedInstance = instance;
        const handler = () => {
          if (!cancelled) {
            readAxis();
          }
        };
        instance.on("finished", handler);
        detachListener = () => instance.off("finished", handler);
      }
      const opt = instance.getOption() as Record<string, unknown>;
      const xAxes = (Array.isArray(opt.xAxis) ? opt.xAxis : [opt.xAxis]).filter(
        Boolean,
      ) as Record<string, unknown>[];
      const lastXAxisIdx = xAxes.length - 1;
      const lastXAxis = xAxes[lastXAxisIdx] ?? null;
      const grids = (Array.isArray(opt.grid) ? opt.grid : [opt.grid]).filter(
        Boolean,
      ) as Record<string, unknown>[];
      const firstGrid = grids[0] ?? null;

      // Read the main chart's post-layout x-axis state via
      // ECharts' internal axis-model API:
      //   - `axis.scale.getExtent()` → DATA-value extent (the
      //     authoritative `[min, max]` for the rendered range,
      //     already including any padding/`scale:true` niceness).
      //   - `axisModel.getCategories(true)` /
      //     `axis.scale.getOrdinalMeta().categories` → the actual
      //     category list for `type:category` axes (histograms).
      //     This includes empty bins and any non-uniform spacing
      //     the cartesian builder emits (e.g. histogram first-bin
      //     extreme-value handling), which can't be reconstructed
      //     from the series rows alone.
      //
      // This is internal-ish ECharts API but stable across 5.x/6.x
      // and used by ECharts' own components.
      let xAxisExtent: [number, number] | null = null;
      let xAxisCategories: (number | string)[] | null = null;
      try {
        const axisComponent = (
          instance as unknown as {
            getModel: () => {
              getComponent: (mainType: string, idx: number) => unknown;
            };
          }
        )
          .getModel()
          .getComponent("xAxis", lastXAxisIdx) as {
          axis?: {
            scale?: {
              getExtent?: () => [number, number];
              getOrdinalMeta?: () => { categories?: unknown[] };
            };
          };
          getCategories?: (rawData?: boolean) => unknown;
        } | null;
        const axis = axisComponent?.axis;
        const extent = axis?.scale?.getExtent?.();
        if (
          extent &&
          Number.isFinite(extent[0]) &&
          Number.isFinite(extent[1])
        ) {
          xAxisExtent = [extent[0], extent[1]];
        }
        // Try `axisModel.getCategories(true)` first; fall back to
        // the OrdinalMeta on the scale.
        const viaGetter = axisComponent?.getCategories?.(true);
        const viaMeta = axis?.scale?.getOrdinalMeta?.()?.categories;
        const rawCategories = Array.isArray(viaGetter)
          ? viaGetter
          : Array.isArray(viaMeta)
            ? viaMeta
            : null;
        if (rawCategories && rawCategories.length > 0) {
          xAxisCategories = rawCategories
            .map((c) => {
              if (typeof c === "number" || typeof c === "string") {
                return c;
              }
              if (c == null) {
                return null;
              }
              // Bin records are objects with `lower`/`upper`; the
              // category value used by ECharts is the lower edge.
              const lower = (c as { lower?: unknown })?.lower;
              if (typeof lower === "number" || typeof lower === "string") {
                return lower;
              }
              const value = (c as { value?: unknown })?.value;
              if (typeof value === "number" || typeof value === "string") {
                return value;
              }
              return null;
            })
            .filter((c): c is number | string => c !== null);
          if (xAxisCategories.length === 0) {
            xAxisCategories = null;
          }
        }
      } catch {
        // Fall through to the function-typed `min`/`max` fallback.
      }

      // Fallback: evaluate function-typed `min`/`max` closures from
      // the option snapshot. Used only if the internal axis model
      // isn't reachable (e.g. future ECharts internals change).
      if (!xAxisExtent) {
        const resolveBound = (v: unknown): number | null => {
          if (typeof v === "function") {
            try {
              const result = (v as () => unknown)();
              return typeof result === "number" && Number.isFinite(result)
                ? result
                : null;
            } catch {
              return null;
            }
          }
          if (typeof v === "number" && Number.isFinite(v)) {
            return v;
          }
          return null;
        };
        const resolvedMin = resolveBound(lastXAxis?.min);
        const resolvedMax = resolveBound(lastXAxis?.max);
        if (resolvedMin != null && resolvedMax != null) {
          xAxisExtent = [resolvedMin, resolvedMax];
        }
      }

      const nextGridLeft =
        (firstGrid?.left as number | string | undefined) ?? null;
      const nextGridRight =
        (firstGrid?.right as number | string | undefined) ?? null;
      // Skip the state update if nothing material changed. The
      // `finished` listener fires on every render pass, so without
      // this guard we'd re-render on every animation frame.
      setMainChartAxisSnapshot((prev) => {
        const extentEqual =
          prev.xAxisExtent === xAxisExtent ||
          (prev.xAxisExtent != null &&
            xAxisExtent != null &&
            prev.xAxisExtent[0] === xAxisExtent[0] &&
            prev.xAxisExtent[1] === xAxisExtent[1]);
        const categoriesEqual =
          prev.xAxisCategories === xAxisCategories ||
          (prev.xAxisCategories != null &&
            xAxisCategories != null &&
            prev.xAxisCategories.length === xAxisCategories.length &&
            prev.xAxisCategories.every((v, i) => v === xAxisCategories?.[i]));
        // Ignore the `xAxis` reference identity — it changes on
        // every `getOption()` call but its content is stable as
        // long as the chart settings don't change. Use the other
        // fields as the actual change signal; keep `prev.xAxis`
        // when only the reference differs, so the sticky chart
        // doesn't pointlessly re-render.
        if (
          prev.xAxis != null &&
          extentEqual &&
          categoriesEqual &&
          prev.gridLeft === nextGridLeft &&
          prev.gridRight === nextGridRight
        ) {
          return prev;
        }
        return {
          xAxis: lastXAxis,
          xAxisExtent,
          xAxisCategories,
          gridLeft: nextGridLeft,
          gridRight: nextGridRight,
        };
      });
    };

    readAxis();
    return () => {
      cancelled = true;
      if (rafId != null) {
        cancelAnimationFrame(rafId);
      }
      if (detachListener) {
        detachListener();
      }
    };
  }, [enabled, resetKey]);

  return { mainChartContainerRef, mainChartAxisSnapshot };
}
