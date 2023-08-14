import { useEffect, useRef } from "react";
import type { EChartsType, EChartsOption } from "echarts";
import { init } from "echarts";
import { useMount } from "react-use";

interface EChartsRendererProps {
  echartsOption: EChartsOption;
  width: number;
  height: number;
}

export function EChartsRenderer({
  echartsOption,
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
    chartRef.current?.setOption(echartsOption, true);
  }, [echartsOption]);

  useEffect(() => {
    chartRef.current?.resize({ width, height });
  }, [width, height]);

  return <div ref={chartElemRef} />;
}
