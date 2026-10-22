import { mergeRefs } from "@mantine/hooks";
import type { EChartsCoreOption, EChartsType } from "echarts/core";
import { init } from "echarts/core";
import { forwardRef, useContext, useEffect, useRef } from "react";
import { useMount, useUnmount, useUpdateEffect } from "react-use";

import { Center } from "metabase/ui";
import {
  type EChartsEventHandler,
  type ZREventHandler,
  registerEChartsModules,
} from "metabase/viz-core";

import {
  type ChartAnimation,
  ChartAnimationContext,
} from "./ChartAnimationContext";
import S from "./EChartsRenderer.module.css";

registerEChartsModules();

// Some charts switch animation off on the whole chart, some on each series
// (Sankey), and some set a zero duration on each series (waterfall), so the
// animation settings go on both levels. Shapes that appear or disappear use
// animationDuration; shapes that change use animationDurationUpdate.
function withAnimation(
  option: EChartsCoreOption,
  { durationMs }: ChartAnimation,
): EChartsCoreOption {
  const animationOption = {
    animation: true,
    animationDuration: durationMs,
    animationDurationUpdate: durationMs,
    animationEasingUpdate: "cubicInOut" as const,
  };
  const animateSeries = (item: unknown) =>
    item != null && typeof item === "object"
      ? withCustomShapeTransition({ ...item, ...animationOption })
      : item;
  const { series } = option;
  const animatedSeries = Array.isArray(series)
    ? series.map(animateSeries)
    : animateSeries(series);

  return { ...option, ...animationOption, series: animatedSeries };
}

function hasSeriesOfType(option: EChartsCoreOption, type: string): boolean {
  const { series } = option;
  const items: unknown[] = Array.isArray(series) ? series : [series];
  return items.some(
    (item) =>
      item != null &&
      typeof item === "object" &&
      "type" in item &&
      item.type === type,
  );
}

type RenderItem = (params: unknown, api: unknown) => unknown;

// Custom series (the waterfall bars) only animate the properties that their
// shapes list in `transition`.
function withCustomShapeTransition<T extends object>(series: T): T {
  if (!("type" in series) || series.type !== "custom") {
    return series;
  }
  if (!("renderItem" in series) || typeof series.renderItem !== "function") {
    return series;
  }
  // renderItem is typed loosely by ECharts; it takes params and api and returns a shape.
  const renderItem = series.renderItem as RenderItem;
  return {
    ...series,
    renderItem: (params: unknown, api: unknown) => {
      const shape = renderItem(params, api);
      return shape != null && typeof shape === "object"
        ? { ...shape, transition: ["shape", "style"] }
        : shape;
    },
  };
}

export interface EChartsRendererProps {
  option: EChartsCoreOption;
  eventHandlers?: EChartsEventHandler[];
  zrEventHandlers?: ZREventHandler[];
  width: number | "auto";
  height: number | "auto";
  onInit?: (chart: EChartsType) => void;
  notMerge?: boolean;
}

export const EChartsRenderer = forwardRef<HTMLDivElement, EChartsRendererProps>(
  function EChartsRenderer(
    {
      option,
      eventHandlers,
      zrEventHandlers,
      width,
      height,
      onInit,
      notMerge = true,
    }: EChartsRendererProps,
    ref,
  ) {
    const chartElemRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<EChartsType>();
    const animation = useContext(ChartAnimationContext);

    useMount(() => {
      chartRef.current = init(chartElemRef.current, null, {
        width,
        height,
        renderer: "svg",
      });

      chartRef.current?.setOption(option, notMerge);

      onInit?.(chartRef.current);
    });

    useUnmount(() => {
      chartRef.current?.dispose();
    });

    useEffect(() => {
      const printMediaQuery = window.matchMedia("print");
      const resizeForPrint = () => {
        const chartElement = chartElemRef.current;
        if (!chartElement) {
          return;
        }

        chartRef.current?.resize({
          width: chartElement.offsetWidth,
          height: chartElement.offsetHeight,
        });
      };

      printMediaQuery.addEventListener("change", resizeForPrint);
      return () => {
        printMediaQuery.removeEventListener("change", resizeForPrint);
      };
    }, []);

    useUpdateEffect(() => {
      if (animation) {
        // Merge instead of replace, so that ECharts keeps the old shapes and
        // moves them to the new data.
        chartRef.current?.setOption(withAnimation(option, animation), {
          notMerge: false,
        });
        if (hasSeriesOfType(option, "sankey")) {
          // ECharts redraws a Sankey chart from scratch on each update, so it
          // fades in instead of moving shapes.
          chartElemRef.current?.animate([{ opacity: 0.25 }, { opacity: 1 }], {
            duration: animation.durationMs,
            easing: "ease-out",
          });
        }
        return;
      }
      chartRef.current?.setOption(option, notMerge);
    }, [option]);

    useUpdateEffect(() => {
      chartRef.current?.resize({ width, height });
    }, [width, height]);

    useEffect(() => {
      eventHandlers?.forEach((h) => {
        if (h.query) {
          chartRef.current?.on(h.eventName, h.query, h.handler);
          return;
        }
        chartRef.current?.on(h.eventName, h.handler);
      });

      return () => {
        if (chartRef.current?.isDisposed()) {
          return;
        }

        eventHandlers?.forEach((h) =>
          chartRef.current?.off(h.eventName, h.handler),
        );
      };
    }, [eventHandlers]);

    useEffect(() => {
      zrEventHandlers?.forEach((h) => {
        chartRef.current?.getZr().on(h.eventName, h.handler);
      });

      return () => {
        if (chartRef.current?.isDisposed()) {
          return;
        }

        zrEventHandlers?.forEach((h) =>
          chartRef.current?.getZr().off(h.eventName, h.handler),
        );
      };
    }, [zrEventHandlers]);

    return (
      <Center
        className={S.chart}
        data-testid="chart-container"
        ref={mergeRefs<HTMLDivElement>(chartElemRef, ref)}
      />
    );
  },
);
