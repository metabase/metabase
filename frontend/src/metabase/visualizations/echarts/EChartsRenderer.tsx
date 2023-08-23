import { useEffect, useRef } from "react";
import { useMount } from "react-use";
import { init } from "echarts";
import type { EChartsType } from "echarts";

import type { EChartsConfig } from "../types";

interface EChartsRendererProps {
  config: EChartsConfig;
  width: number | "auto";
  height: number | "auto";
}

export function EChartsRenderer({
  config: { option, eventHandlers, zrEventHandlers },
  width,
  height,
}: EChartsRendererProps) {
  const chartElemRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType>();

  useMount(() => {
    chartRef.current = init(chartElemRef.current, null, {
      width,
      height,
      renderer: "svg",
    });
  });

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  useEffect(() => {
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
}
