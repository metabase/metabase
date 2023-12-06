import { useEffect, useRef } from "react";
import { useMount, useUpdateEffect } from "react-use";
import { init } from "echarts";
import type { EChartsType, EChartsOption } from "echarts";

import type {
  EChartsEventHandler,
  ZREventHandler,
} from "metabase/visualizations/types/echarts";

export interface EChartsRendererProps {
  option: EChartsOption;
  eventHandlers: EChartsEventHandler[];
  zrEventHandlers: ZREventHandler[];
  width: number | "auto";
  height: number | "auto";
  onInit?: (chart: EChartsType) => void;
}

export const EChartsRenderer = ({
  option,
  eventHandlers,
  zrEventHandlers,
  width,
  height,
  onInit,
}: EChartsRendererProps) => {
  const chartElemRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType>();

  useMount(() => {
    chartRef.current = init(chartElemRef.current, null, {
      width,
      height,
      renderer: "svg",
    });

    chartRef.current?.setOption(option, true);
    onInit?.(chartRef.current);
  });

  useUpdateEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  useUpdateEffect(() => {
    chartRef.current?.resize({ width, height });
  }, [width, height]);

  useEffect(() => {
    eventHandlers.forEach(h => {
      if (h.query) {
        chartRef.current?.on(h.eventName, h.query, h.handler);
        return;
      }
      chartRef.current?.on(h.eventName, h.handler);
    });

    return () =>
      eventHandlers.forEach(h => chartRef.current?.off(h.eventName, h.handler));
  }, [eventHandlers]);

  useEffect(() => {
    zrEventHandlers.forEach(h => {
      chartRef.current?.getZr().on(h.eventName, h.handler);
    });

    return () =>
      zrEventHandlers.forEach(h =>
        chartRef.current?.getZr().off(h.eventName, h.handler),
      );
  }, [zrEventHandlers]);

  return <div ref={chartElemRef} />;
};
