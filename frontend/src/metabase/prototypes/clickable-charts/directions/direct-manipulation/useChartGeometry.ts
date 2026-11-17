import type { EChartsType } from "echarts/core";
import { getInstanceByDom } from "echarts/core";
import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import _ from "underscore";

/** One plotted value of the first series, with where the chart draws it. */
export type ChartPoint = {
  /** The x value as the chart has it (category, ISO date or number). */
  x: unknown;
  y: number;
  px: number;
  py: number;
};

export type ChartGeometry = {
  /** The plot area, relative to the container. */
  plot: { left: number; top: number; width: number; height: number };
  points: ChartPoint[];
  /** Width of one x slot (a bar, or the gap between two line points). */
  band: number;
};

type YScale = {
  valueAt: (py: number) => number;
  pixelOf: (value: number) => number;
};

/**
 * Reads the layout of the ECharts chart rendered inside `containerRef`: its
 * plot rect and where the first series' values sit, so an overlay can line up
 * handles with the axes. Pareto: single-series, first y-axis.
 */
export function useChartGeometry(
  containerRef: RefObject<HTMLDivElement | null>,
  isEnabled: boolean,
): { geometry: ChartGeometry | undefined; yScale: YScale } {
  const [geometry, setGeometry] = useState<ChartGeometry>();
  const chartRef = useRef<EChartsType | undefined>(undefined);
  const offsetRef = useRef({ left: 0, top: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !isEnabled) {
      setGeometry(undefined);
      return;
    }
    let chart: EChartsType | undefined;
    const update = () => {
      const next = chart ? readGeometry(container, chart) : undefined;
      if (next && chart) {
        const chartRect = chart.getDom().getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        offsetRef.current = {
          left: chartRect.left - containerRect.left,
          top: chartRect.top - containerRect.top,
        };
      }
      setGeometry((previous) => (_.isEqual(previous, next) ? previous : next));
    };
    const attach = () => {
      const el = container.querySelector("[_echarts_instance_]");
      const next = el instanceof HTMLElement ? getInstanceByDom(el) : undefined;
      if (next !== chart) {
        chart?.off("finished", update);
        chart = next;
        chartRef.current = next;
        chart?.on("finished", update);
        update();
      }
    };
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(container, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      chart?.off("finished", update);
    };
  }, [containerRef, isEnabled]);

  const yScale: YScale = {
    valueAt: (py) =>
      Number(
        chartRef.current?.convertFromPixel(
          { yAxisIndex: 0 },
          py - offsetRef.current.top,
        ),
      ),
    pixelOf: (value) =>
      Number(chartRef.current?.convertToPixel({ yAxisIndex: 0 }, value)) +
      offsetRef.current.top,
  };

  return { geometry, yScale };
}

type SeriesOption = {
  type?: string;
  yAxisIndex?: number;
  datasetIndex?: number;
  encode?: { x?: string; y?: string };
};

function readGeometry(
  container: HTMLElement,
  chart: EChartsType,
): ChartGeometry | undefined {
  try {
    // getOption() is loosely typed; these are the only fields read here.
    const option = chart.getOption() as {
      series?: SeriesOption[];
      dataset?: { source?: Record<string, unknown>[] }[];
    };
    const seriesIndex = (option.series ?? []).findIndex(
      (series) =>
        ["bar", "line", "scatter"].includes(series.type ?? "") &&
        (series.yAxisIndex ?? 0) === 0 &&
        series.encode?.x != null &&
        series.encode?.y != null,
    );
    if (seriesIndex < 0) {
      return undefined;
    }
    const series = option.series![seriesIndex];
    const source = option.dataset?.[series.datasetIndex ?? 0]?.source ?? [];
    const xKey = series.encode!.x!;
    const yKey = series.encode!.y!;

    const chartRect = chart.getDom().getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const dx = chartRect.left - containerRect.left;
    const dy = chartRect.top - containerRect.top;

    const points = source.flatMap((row): ChartPoint[] => {
      const x = row[xKey];
      const y = row[yKey];
      if (x == null || typeof y !== "number") {
        return [];
      }
      // ECharts types the value as a scalar, but a [x, y] pair is what it takes for a series.
      const pixel: unknown = chart.convertToPixel({ seriesIndex }, [
        x,
        y,
      ] as never);
      if (!Array.isArray(pixel) || !isFinite(pixel[0]) || !isFinite(pixel[1])) {
        return [];
      }
      return [
        {
          x,
          y,
          px: Math.round(pixel[0] + dx),
          py: Math.round(pixel[1] + dy),
        },
      ];
    });

    // Not part of the public typings, but the only way to the plot rect.
    const grid = (
      chart as unknown as {
        getModel: () => {
          getComponent: (
            type: string,
            index: number,
          ) => {
            coordinateSystem: {
              getRect: () => {
                x: number;
                y: number;
                width: number;
                height: number;
              };
            };
          };
        };
      }
    )
      .getModel()
      .getComponent("grid", 0)
      .coordinateSystem.getRect();

    const xs = _.sortBy(points.map((point) => point.px));
    const gaps = xs
      .slice(1)
      .map((x, index) => x - xs[index])
      .filter(Boolean);
    const band =
      gaps.length > 0
        ? Math.min(...gaps)
        : grid.width / Math.max(points.length, 1);

    return {
      plot: {
        left: Math.round(grid.x + dx),
        top: Math.round(grid.y + dy),
        width: Math.round(grid.width),
        height: Math.round(grid.height),
      },
      points: _.sortBy(points, "px"),
      band,
    };
  } catch {
    return undefined;
  }
}
