/**
 * Example: Lazy Loading Chart Component
 * 
 * This example shows how to lazy load a heavy chart library (echarts)
 * to reduce the initial bundle size.
 * 
 * BEFORE: Chart library loaded in main bundle (~300KB)
 * AFTER: Chart library loaded only when chart is rendered (~0KB initially)
 */

import { lazy, Suspense, useState, useEffect } from "react";
import type { EChartsOption } from "echarts";

// ❌ BAD: Loading echarts upfront adds ~300KB to main bundle
// import * as echarts from "echarts";

// ✅ GOOD: Lazy load the chart component
const ChartRenderer = lazy(() => import("./ChartRenderer"));

interface ChartProps {
  data: any[];
  options?: Partial<EChartsOption>;
  width?: number | string;
  height?: number | string;
}

/**
 * Chart component that lazy loads echarts
 */
export function Chart({ data, options, width = "100%", height = "400px" }: ChartProps) {
  const [isVisible, setIsVisible] = useState(false);

  // Optional: Only load chart when it becomes visible (Intersection Observer)
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    const element = document.getElementById("chart-container");
    if (element) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, []);

  // Loading state component
  const LoadingSpinner = () => (
    <div 
      style={{ 
        width, 
        height, 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center" 
      }}
    >
      <div>Loading chart...</div>
    </div>
  );

  return (
    <div id="chart-container" style={{ width, height }}>
      {/* Only render chart when visible */}
      {isVisible && (
        <Suspense fallback={<LoadingSpinner />}>
          <ChartRenderer data={data} options={options} width={width} height={height} />
        </Suspense>
      )}
    </div>
  );
}

/**
 * Alternative: Even simpler approach without intersection observer
 */
export function SimpleChart({ data, options, width = "100%", height = "400px" }: ChartProps) {
  return (
    <Suspense fallback={<div style={{ width, height }}>Loading chart...</div>}>
      <ChartRenderer data={data} options={options} width={width} height={height} />
    </Suspense>
  );
}

/**
 * Usage:
 * 
 * import { Chart } from "./LazyChart";
 * 
 * function Dashboard() {
 *   return (
 *     <div>
 *       <h1>Dashboard</h1>
 *       <Chart data={myData} options={chartOptions} />
 *     </div>
 *   );
 * }
 */
