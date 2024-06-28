import type { EChartsCoreOption, EChartsType } from "echarts/core";
import { init } from "echarts/core";
import { useEffect, useRef } from "react";
import { useMount, useUpdateEffect } from "react-use";

import { registerEChartsModules } from "metabase/visualizations/echarts";
import type {
  EChartsEventHandler,
  ZREventHandler,
} from "metabase/visualizations/types/echarts";

import { EChartsRendererRoot } from "./EChartsRenderer.styled";

registerEChartsModules();

export interface EChartsRendererProps {
  option: EChartsCoreOption;
  eventHandlers?: EChartsEventHandler[];
  zrEventHandlers?: ZREventHandler[];
  width: number | "auto";
  height: number | "auto";
  onInit?: (chart: EChartsType) => void;
  notMerge?: boolean;
}

export const EChartsRenderer = ({
  option,
  eventHandlers,
  zrEventHandlers,
  width,
  height,
  onInit,
  notMerge = true,
}: EChartsRendererProps) => {
  const chartElemRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType>();

  useMount(() => {
    chartRef.current = init(chartElemRef.current, null, {
      width,
      height,
      renderer: "svg",
    });

    chartRef.current?.setOption(option, notMerge);
    onInit?.(chartRef.current);
  });

  useUpdateEffect(() => {
    chartRef.current?.setOption(option, notMerge);
  }, [option]);

  useUpdateEffect(() => {
    chartRef.current?.resize({ width, height });
  }, [width, height]);

  useEffect(() => {
    eventHandlers?.forEach(h => {
      if (h.query) {
        chartRef.current?.on(h.eventName, h.query, h.handler);
        return;
      }
      chartRef.current?.on(h.eventName, h.handler);
    });

    return () =>
      eventHandlers?.forEach(h =>
        chartRef.current?.off(h.eventName, h.handler),
      );
  }, [eventHandlers]);

  useEffect(() => {
    zrEventHandlers?.forEach(h => {
      chartRef.current?.getZr().on(h.eventName, h.handler);
    });

    return () =>
      zrEventHandlers?.forEach(h =>
        chartRef.current?.getZr().off(h.eventName, h.handler),
      );
  }, [zrEventHandlers]);

  return (
    <EChartsRendererRoot data-testid="chart-container" ref={chartElemRef} />
  );
};
