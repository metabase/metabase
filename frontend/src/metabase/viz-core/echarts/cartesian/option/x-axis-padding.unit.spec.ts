import { LineChart, ScatterChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

import { createMockChartLayout } from "__support__/echarts";
import { dayjs } from "metabase/dayjs";
import { createMockVisualizationSettings } from "metabase-types/api/mocks";

import { DEFAULT_VISUALIZATION_THEME } from "../../../shared/utils/theme";
import type { RenderingContext } from "../../../types";
import type { NumericXAxisModel, TimeSeriesXAxisModel } from "../model/types";

import {
  buildCategoricalDimensionAxis,
  buildNumericDimensionAxis,
  buildTimeSeriesDimensionAxis,
} from "./axis";
import {
  getCategoricalAxisLabelPadding,
  getContinuousAxisPadding,
  getXAxisLabelPadding,
} from "./x-axis-padding";

echarts.use([LineChart, ScatterChart, GridComponent, SVGRenderer]);

const renderingContext: RenderingContext = {
  getColor: (name) => name,
  measureText: (text) => text.length,
  measureTextHeight: () => 14,
  fontFamily: "Lato",
  theme: DEFAULT_VISUALIZATION_THEME,
};

describe("getXAxisLabelPadding", () => {
  it.each([
    [200, 8],
    [299, 8],
    [300, 16],
    [899, 16],
    [900, 24],
  ])("uses %ipx axis width to select %ipx padding", (width, padding) => {
    expect(getXAxisLabelPadding(width)).toBe(padding);
  });
});

describe("getContinuousAxisPadding", () => {
  it("keeps existing space for sparse data", () => {
    const layout = createMockChartLayout({
      outerWidth: 300,
      ticksDimensions: { firstXTickWidth: 40, lastXTickWidth: 40 },
    });

    expect(getContinuousAxisPadding(0.5, 2, layout)).toBe(0.5);
  });

  it.each([200, 300, 900])(
    "leaves the required label clearance for dense data at %ipx",
    (axisWidth) => {
      const labelWidth = 40;
      const domainWidth = 100;
      const layout = createMockChartLayout({
        outerWidth: axisWidth + 80,
        padding: { left: 64, right: 16 },
        ticksDimensions: {
          firstXTickWidth: labelWidth,
          lastXTickWidth: labelWidth,
        },
      });
      const padding = getContinuousAxisPadding(0.5, domainWidth, layout);
      const endpointPosition =
        (padding / (domainWidth + 2 * padding)) * axisWidth;

      expect(endpointPosition - labelWidth / 2).toBeCloseTo(
        getXAxisLabelPadding(axisWidth),
      );
    },
  );

  it("preserves the domain when there is no room for both labels", () => {
    const layout = createMockChartLayout({
      outerWidth: 30,
      ticksDimensions: { firstXTickWidth: 40, lastXTickWidth: 40 },
    });

    expect(getContinuousAxisPadding(0.5, 100, layout)).toBe(0.5);
  });

  it("preserves the domain for a hidden axis", () => {
    const layout = createMockChartLayout({
      outerWidth: 300,
      axisEnabledSetting: false,
      ticksDimensions: { firstXTickWidth: 40, lastXTickWidth: 40 },
    });

    expect(getContinuousAxisPadding(0.5, 100, layout)).toBe(0.5);
  });

  it.each(["rotate-45", "rotate-90"] as const)(
    "preserves %s axis padding",
    (axisEnabledSetting) => {
      const layout = createMockChartLayout({
        outerWidth: 400,
        axisEnabledSetting,
        ticksDimensions: { firstXTickWidth: 12, lastXTickWidth: 12 },
      });
      expect(getContinuousAxisPadding(0.5, 20, layout)).toBe(0.5);
    },
  );

  it("keeps at least half of a narrow plot available for dense data", () => {
    const layout = createMockChartLayout({
      outerWidth: 120,
      ticksDimensions: { firstXTickWidth: 70, lastXTickWidth: 70 },
    });
    const padding = getContinuousAxisPadding(0.5, 100, layout);
    expect(100 / (100 + 2 * padding)).toBeGreaterThanOrEqual(0.5);
  });
});

describe("getCategoricalAxisLabelPadding", () => {
  it("limits label measurement for large category datasets and reuses measured widths", () => {
    const getXTickWidth = jest.fn(() => 40);
    const formatter = jest.fn((value: string) => ` ${value} `);
    const layout = createMockChartLayout({
      outerWidth: 900,
      ticksDimensions: {
        firstXTickWidth: 40,
        lastXTickWidth: 40,
        getXTickWidth,
      },
    });
    const { interval } = getCategoricalAxisLabelPadding(
      10_000,
      layout,
      formatter,
    );
    expect(typeof interval).toBe("function");
    if (typeof interval === "function") {
      for (let index = 0; index < 10_000; index++) {
        interval(index, String(index));
      }
    }
    const calls = getXTickWidth.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThan(50);
    if (typeof interval === "function") {
      for (let index = 0; index < 10_000; index++) {
        interval(index, String(index));
      }
    }
    expect(getXTickWidth).toHaveBeenCalledTimes(calls);
  });
  it("preserves centered labels when category bands provide enough space", () => {
    const layout = createMockChartLayout({
      outerWidth: 300,
      ticksDimensions: { firstXTickWidth: 40, lastXTickWidth: 40 },
    });

    expect(getCategoricalAxisLabelPadding(2, layout)).toEqual({});
  });

  it("aligns labels inward when category bands are too narrow", () => {
    const layout = createMockChartLayout({
      outerWidth: 300,
      ticksDimensions: { firstXTickWidth: 40, lastXTickWidth: 40 },
    });

    expect(getCategoricalAxisLabelPadding(10, layout)).toEqual({
      alignMinLabel: "left",
      alignMaxLabel: "right",
      padding: [0, 1],
      interval: expect.any(Function),
    });
  });

  it("leaves a single category centered", () => {
    const layout = createMockChartLayout({
      outerWidth: 100,
      ticksDimensions: { firstXTickWidth: 100, lastXTickWidth: 100 },
    });

    expect(getCategoricalAxisLabelPadding(1, layout)).toEqual({});
  });

  it("preserves rotated-label positioning", () => {
    const layout = createMockChartLayout({
      outerWidth: 300,
      axisEnabledSetting: "rotate-45",
    });

    expect(getCategoricalAxisLabelPadding(10, layout)).toEqual({});
  });
});

describe("rendered X-axis labels", () => {
  it.each([
    { width: 300, labels: ["Doohickey", "Gadget", "Gizmo", "Widget"] },
    {
      width: 470,
      labels: Array.from(
        { length: 8 },
        (_, index) => `${index + 1} – ${index + 2}`,
      ),
    },
  ])(
    "preserves fitting category labels on a $width px plot (UXW-5182)",
    ({ width, labels }) => {
      const measure = (value: string) =>
        echarts.format.getTextRect(value, "13px Lato").width;
      const layout = createMockChartLayout({
        outerWidth: width,
        ticksDimensions: {
          firstXTickWidth: measure(labels[0]),
          lastXTickWidth: measure(labels[labels.length - 1]),
          xTickWidthCap: Infinity,
          getXTickWidth: measure,
        },
      });
      const axis = buildCategoricalDimensionAxis(
        { formatter: String, column: undefined, datasetLength: labels.length },
        createMockVisualizationSettings({ "graph.x_axis.axis_enabled": true }),
        layout,
        renderingContext,
      );
      const chart = echarts.init(null, undefined, {
        renderer: "svg",
        ssr: true,
        width,
        height: 200,
      });
      try {
        chart.setOption({
          animation: false,
          grid: {
            left: 0,
            right: 0,
            top: 0,
            bottom: 30,
            outerBoundsMode: "none",
          },
          xAxis: { ...axis, data: labels },
          yAxis: { show: false },
          series: [{ type: "line", data: labels.map(() => 1) }],
        });
        const svg = new DOMParser().parseFromString(
          chart.renderToSVGString(),
          "image/svg+xml",
        );
        expect(
          Array.from(svg.querySelectorAll("text"), (node) =>
            node.textContent?.trim(),
          ),
        ).toEqual(labels);
        expectLabelClearance(chart, getXAxisLabelPadding(width), width);
      } finally {
        chart.dispose();
      }
    },
  );

  it.each([
    [200, 20],
    [300, 20],
    [900, 20],
    [300, 100],
    [900, 100],
  ])(
    "keeps %ipx-axis labels inside the edges with %i categories",
    (width, count) => {
      const labels = Array.from(
        { length: count },
        (_, index) => `Tick ${index}`,
      );
      const layout = createMockChartLayout({
        outerWidth: width,
        ticksDimensions: {
          firstXTickWidth: 40,
          lastXTickWidth: 40,
          xTickWidthCap: Infinity,
        },
      });
      const axis = buildCategoricalDimensionAxis(
        { formatter: String, column: undefined, datasetLength: labels.length },
        createMockVisualizationSettings({ "graph.x_axis.axis_enabled": true }),
        layout,
        renderingContext,
      );
      const chart = echarts.init(null, undefined, {
        renderer: "svg",
        ssr: true,
        width,
        height: 200,
      });

      try {
        chart.setOption({
          animation: false,
          grid: {
            left: 0,
            right: 0,
            top: 0,
            bottom: 30,
            outerBoundsMode: "none",
          },
          xAxis: { ...axis, data: labels },
          yAxis: { show: false },
          series: [{ type: "line", data: labels.map(() => 1) }],
        });

        expect(chart.convertToPixel({ xAxisIndex: 0 }, 0)).toBeCloseTo(
          width / labels.length / 2,
        );
        expectLabelClearance(chart, getXAxisLabelPadding(width), width);
      } finally {
        chart.dispose();
      }
    },
  );

  it.each([200, 300, 900])(
    "keeps binned scatter labels inside a %ipx axis without moving data points",
    (width) => {
      const model: NumericXAxisModel = {
        axisType: "value",
        extent: [0, 100],
        interval: 1,
        intervalsCount: 100,
        ticksMaxInterval: 1,
        isPadded: false,
        toEChartsAxisValue: (value) =>
          typeof value === "number" ? value : null,
        fromEChartsAxisValue: (value) => value,
        formatter: String,
      };
      const axis = buildNumericDimensionAxis(
        model,
        createMockVisualizationSettings({ "graph.x_axis.axis_enabled": true }),
        createMockChartLayout({ outerWidth: width }),
        renderingContext,
      );
      const chart = echarts.init(null, undefined, {
        renderer: "svg",
        ssr: true,
        width,
        height: 200,
      });

      try {
        chart.setOption({
          animation: false,
          grid: {
            left: 0,
            right: 0,
            top: 0,
            bottom: 30,
            outerBoundsMode: "none",
          },
          xAxis: axis,
          yAxis: { show: false },
          series: [
            {
              type: "scatter",
              data: [
                [0, 1],
                [100, 2],
              ],
            },
          ],
        });

        expect(chart.convertToPixel({ xAxisIndex: 0 }, 0)).toBeCloseTo(0);
        expect(chart.convertToPixel({ xAxisIndex: 0 }, 50)).toBeCloseTo(
          width / 2,
        );
        expect(chart.convertToPixel({ xAxisIndex: 0 }, 100)).toBeCloseTo(width);
        expectLabelClearance(chart, getXAxisLabelPadding(width), width);
      } finally {
        chart.dispose();
      }
    },
  );

  it.each([200, 300, 900])(
    "keeps timeseries labels inside a %ipx axis",
    (width) => {
      const start = dayjs.utc("2025-01-01");
      const end = start.add(100, "day");
      const model: TimeSeriesXAxisModel = {
        axisType: "time",
        range: [start, end],
        interval: { unit: "day", count: 1 },
        intervalsCount: 100,
        toEChartsAxisValue: (value) => String(value),
        fromEChartsAxisValue: (value) => dayjs.utc(value),
        formatter: (value) => dayjs(String(value)).format("MMM D"),
      };
      const layout = createMockChartLayout({
        outerWidth: width,
        ticksDimensions: { firstXTickWidth: 40, lastXTickWidth: 40 },
      });
      const axis = buildTimeSeriesDimensionAxis(
        model,
        false,
        createMockVisualizationSettings({ "graph.x_axis.axis_enabled": true }),
        layout,
        renderingContext,
      );
      const chart = echarts.init(null, undefined, {
        renderer: "svg",
        ssr: true,
        width,
        height: 200,
      });

      try {
        chart.setOption({
          animation: false,
          useUTC: true,
          grid: {
            left: 0,
            right: 0,
            top: 0,
            bottom: 30,
            outerBoundsMode: "none",
          },
          xAxis: axis,
          yAxis: { show: false },
          series: [
            {
              type: "line",
              data: [
                [start.valueOf(), 1],
                [end.valueOf(), 2],
              ],
            },
          ],
        });

        expectLabelClearance(chart, getXAxisLabelPadding(width), width);
      } finally {
        chart.dispose();
      }
    },
  );
});

function expectLabelClearance(
  chart: echarts.EChartsType,
  padding: number,
  width: number,
) {
  chart.renderToSVGString();
  const labels = chart
    .getZr()
    .storage.getDisplayList(true)
    .filter((element) => {
      const text: unknown = element.style.text;
      return (
        element.type === "tspan" && typeof text === "string" && text.trim()
      );
    });

  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) {
    const bounds = label.getBoundingRect().clone();
    if (label.transform) {
      bounds.applyTransform(label.transform);
    }
    expect(bounds.x).toBeGreaterThanOrEqual(padding);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - padding);
  }
}
