import { LineChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import type { YAXisOption } from "echarts/types/dist/shared";

import type { Extent } from "../../../types";

import { getResponsiveYAxisTicks } from "./y-axis-ticks";

echarts.use([LineChart, GridComponent, SVGRenderer]);

const scenarios: {
  name: string;
  extent: Extent;
  axis: Extract<YAXisOption, { type?: "value" }>;
}[] = [
  { name: "round range", extent: [0, 100], axis: {} },
  { name: "dense range", extent: [10000, 120000], axis: {} },
  { name: "mixed signs", extent: [-70, 30], axis: {} },
  { name: "negative range", extent: [-200, -100], axis: { scale: true } },
  { name: "constant positive series", extent: [7, 7], axis: {} },
  { name: "constant negative series", extent: [-3, -3], axis: {} },
  { name: "constant unpinned series", extent: [7, 7], axis: { scale: true } },
  { name: "normalized range", extent: [0.1, 0.8], axis: { min: 0, max: 1 } },
  { name: "manual bounds", extent: [13, 77], axis: { min: 10, max: 90 } },
];

describe.each(scenarios)(
  "responsive Y-axis ticks with $name",
  ({ extent, axis }) => {
    it.each([
      [199, 2, 3],
      [200, 3, 3],
      [299, 3, 3],
      [300, 3, 5],
      [399, 3, 5],
      [400, 5, 5],
    ])("renders %ipx density", (height, labelCount, lineCount) => {
      const baseAxis = {
        type: "value" as const,
        splitNumber: 5,
        axisLabel: { formatter: (value: number) => `Y:${value}` },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: "currentColor" } },
        ...axis,
      };
      const responsiveAxis = getResponsiveYAxisTicks(extent, baseAxis, height);
      const chart = echarts.init(null, undefined, {
        renderer: "svg",
        ssr: true,
        width: 400,
        height: 500,
      });

      try {
        const option = {
          animation: false,
          xAxis: { type: "category" as const, data: ["a", "b"], show: false },
          series: [{ type: "line" as const, data: extent, showSymbol: false }],
        };
        chart.setOption({ ...option, yAxis: baseAxis });
        const originalPixels = extent.map((value) =>
          chart.convertToPixel({ yAxisIndex: 0 }, value),
        );

        chart.setOption({ ...option, yAxis: responsiveAxis }, true);
        const svg = new DOMParser().parseFromString(
          chart.renderToSVGString(),
          "image/svg+xml",
        );
        const labels = Array.from(svg.querySelectorAll("text")).filter((node) =>
          node.textContent?.startsWith("Y:"),
        );
        const gridlineCount = Array.from(
          svg.querySelectorAll('path[stroke="currentColor"]'),
        ).reduce(
          (count, path) =>
            count + (path.getAttribute("d")?.match(/M/g)?.length ?? 0),
          0,
        );

        expect(labels).toHaveLength(labelCount);
        expect(gridlineCount).toBe(lineCount);
        expect(
          extent.map((value) => chart.convertToPixel({ yAxisIndex: 0 }, value)),
        ).toEqual(originalPixels);
        expect(responsiveAxis.min).toBe(baseAxis.min);
        expect(responsiveAxis.max).toBe(baseAxis.max);
        expect(responsiveAxis.splitNumber).toBe(5);
      } finally {
        chart.dispose();
      }
    });
  },
);

it("uses the specified quarter and midpoint ticks for a zero to 100 range", () => {
  const axis = getResponsiveYAxisTicks(
    [0, 100],
    { type: "value", splitNumber: 5 },
    300,
  );

  expect(axis.axisTick?.customValues).toEqual([0, 25, 50, 75, 100]);
  expect(axis.axisLabel?.customValues).toEqual([0, 50, 100]);
  expect(axis.minorSplitLine?.show).toBe(false);
});
