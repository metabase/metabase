/**
 * Example: Chart Renderer Component (Lazy Loaded)
 * 
 * This is the actual renderer that imports echarts.
 * It's in a separate file so it can be lazy loaded.
 */

import { useEffect, useRef } from "react";
import type { EChartsOption } from "echarts";

interface ChartRendererProps {
  data: any[];
  options?: Partial<EChartsOption>;
  width?: number | string;
  height?: number | string;
}

export default function ChartRenderer({ 
  data, 
  options, 
  width = "100%", 
  height = "400px" 
}: ChartRendererProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<any>(null);

  useEffect(() => {
    // Dynamically import echarts only when this component renders
    import("echarts").then((echarts) => {
      if (!chartRef.current) return;

      // Initialize chart
      chartInstanceRef.current = echarts.init(chartRef.current);

      // Set options
      const chartOptions: EChartsOption = {
        ...options,
        series: [
          {
            type: "bar",
            data: data,
          },
        ],
      };

      chartInstanceRef.current.setOption(chartOptions);

      // Handle resize
      const handleResize = () => {
        chartInstanceRef.current?.resize();
      };

      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        chartInstanceRef.current?.dispose();
      };
    });
  }, [data, options]);

  return <div ref={chartRef} style={{ width, height }} />;
}

/**
 * Benefits of this approach:
 * 
 * 1. echarts (~300KB) is NOT in the main bundle
 * 2. It's loaded only when a chart is actually rendered
 * 3. Multiple charts on same page share the same echarts instance
 * 4. The bundle is automatically split by webpack/rspack
 * 5. First load of app is much faster
 */
