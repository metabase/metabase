import { BarChart, LineChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { platformApi } from "zrender/lib/core/platform.js";

import {
  createMockChartLayout,
  measureTextEChartsAdapter,
  measureTextWidth,
} from "__support__/echarts";

import type { Extent } from "../../../types";
import type { NumericXAxisModel } from "../model/types";

import { getNumericAxisPadding } from "./numeric-axis-padding";

echarts.use([BarChart, LineChart, GridComponent, SVGRenderer]);

const createAxis = (
  overrides: Partial<NumericXAxisModel> = {},
): NumericXAxisModel => ({
  axisType: "value",
  isDashboard: true,
  extent: [13, 197],
  interval: 92,
  intervalsCount: 2,
  isPadded: true,
  formatter: String,
  toEChartsAxisValue: (value) => (typeof value === "number" ? value : null),
  fromEChartsAxisValue: (value) => value,
  ...overrides,
});

const createLayout = (width: number) =>
  createMockChartLayout({
    outerWidth: width,
    ticksDimensions: {
      getXTickWidth: (text) => measureTextWidth(text, 12, 400),
    },
  });

describe("getNumericAxisPadding", () => {
  it("keeps unpadded scatter axes on their native scale", () => {
    expect(
      getNumericAxisPadding(createAxis({ isPadded: false }), createLayout(900)),
    ).toBeUndefined();
  });

  describe.each([
    { width: 299, padding: 8 },
    { width: 300, padding: 16 },
    { width: 899, padding: 16 },
    { width: 900, padding: 24 },
  ])("$width px axis", ({ width, padding }) => {
    it.each(["line", "bar"] as const)(
      "places the irregular numeric endpoints and %s data at the requested insets (UXW-5182)",
      (seriesType) => {
        const axis = createAxis();
        const layout = createLayout(width);
        layout.xAxisMarkWidthRatio = seriesType === "bar" ? 0.8 : undefined;
        const result = getNumericAxisPadding(axis, layout);
        expect(result).toBeDefined();
        if (result === undefined) {
          return;
        }
        const { options, step } = result;
        const previousMeasureText = platformApi.measureText;
        echarts.setPlatformAPI({ measureText: measureTextEChartsAdapter });
        const chart = echarts.init(null, undefined, {
          renderer: "svg",
          ssr: true,
          width,
          height: 250,
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
            xAxis: {
              ...options,
              type: "value",
              scale: true,
              axisLabel: {
                ...options.axisLabel,
                fontFamily: "Lato",
                fontSize: 12,
              },
            },
            yAxis: { type: "value", show: false },
            series: [
              {
                type: seriesType,
                ...(seriesType === "bar" ? { barWidth: 0.8 * step } : {}),
                data: [
                  [13, 1],
                  [105, 4],
                  [197, 2],
                ],
              },
            ],
          });
          expect(chart.renderToSVGString()).toContain("197");
          const labels = chart
            .getZr()
            .storage.getDisplayList(true)
            .filter((element) => element.type === "tspan")
            .map((label) => {
              const bounds = label.getBoundingRect().clone();
              if (label.transform) {
                bounds.applyTransform(label.transform);
              }
              return bounds;
            })
            .sort((left, right) => left.x - right.x);

          expect(labels.length).toBeGreaterThanOrEqual(2);
          const first = labels[0];
          const last = labels[labels.length - 1];
          const isBar = seriesType === "bar";
          const markHalfWidth = isBar ? 0.4 * step : 0;
          const widestLabelHalfWidth = Math.max(first.width, last.width) / 2;
          const firstLabelHalfWidth = isBar
            ? first.width / 2
            : widestLabelHalfWidth;
          const lastLabelHalfWidth = isBar
            ? last.width / 2
            : widestLabelHalfWidth;
          const firstPosition = chart.convertToPixel({ xAxisIndex: 0 }, 13);
          const lastPosition = chart.convertToPixel({ xAxisIndex: 0 }, 197);
          expect(firstPosition).toBeCloseTo(
            padding + Math.max(firstLabelHalfWidth, markHalfWidth),
            3,
          );
          expect(lastPosition).toBeCloseTo(
            width - padding - Math.max(lastLabelHalfWidth, markHalfWidth),
            3,
          );
          expect(first.x + first.width / 2).toBeCloseTo(
            isBar ? firstPosition : padding + first.width / 2,
            3,
          );
          expect(last.x + last.width / 2).toBeCloseTo(
            isBar ? lastPosition : width - padding - last.width / 2,
            3,
          );
          expect(first.x).toBeGreaterThanOrEqual(padding - 0.001);
          expect(width - last.x - last.width).toBeGreaterThanOrEqual(
            padding - 0.001,
          );
          const firstVisibleEdge = isBar
            ? Math.min(first.x, firstPosition - markHalfWidth)
            : first.x;
          const lastVisibleEdge = isBar
            ? Math.max(last.x + last.width, lastPosition + markHalfWidth)
            : last.x + last.width;
          expect(firstVisibleEdge).toBeCloseTo(padding, 3);
          expect(width - lastVisibleEdge).toBeCloseTo(padding, 3);
          for (let index = 1; index < labels.length; index++) {
            const previous = labels[index - 1];
            expect(labels[index].x).toBeGreaterThanOrEqual(
              previous.x + previous.width,
            );
          }
          const bars = chart
            .getZr()
            .storage.getDisplayList(true)
            .filter((element) => element.type === "rect");
          expect(bars).toHaveLength(seriesType === "bar" ? 3 : 0);
          for (const bar of bars) {
            const bounds = bar.getBoundingRect().clone();
            if (bar.transform) {
              bounds.applyTransform(bar.transform);
            }
            expect(bounds.x).toBeGreaterThanOrEqual(padding - 0.001);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(
              width - padding + 0.001,
            );
            expect(bounds.width).toBeCloseTo(0.8 * step, 3);
          }
        } finally {
          chart.dispose();
          echarts.setPlatformAPI({ measureText: previousMeasureText });
        }
      },
    );
  });

  it("keeps binned labels on their original lattice (UXW-5182)", () => {
    const options = getNumericAxisPadding(
      createAxis({ extent: [5, 25], interval: 10, ticksMaxInterval: 10 }),
      createLayout(900),
    );
    expect(options?.options.axisLabel?.customValues).toEqual([5, 15, 25]);
  });

  it("formats transformed numeric endpoints in original units (UXW-5182)", () => {
    const options = getNumericAxisPadding(
      createAxis({
        extent: [1, 3],
        interval: 1,
        fromEChartsAxisValue: (value) => 10 ** value,
        toEChartsAxisValue: (value) =>
          typeof value === "number" ? Math.log10(value) : null,
      }),
      createLayout(300),
    );
    const formatter = options?.options.axisLabel?.formatter;
    expect(typeof formatter).toBe("function");
    if (typeof formatter !== "function") {
      return;
    }
    expect(formatter(1, 0, undefined)).toBe("10");
    expect(formatter(3, 1, undefined)).toBe("1000");
  });

  it("leaves full-page axes unchanged", () => {
    expect(
      getNumericAxisPadding(
        createAxis({ isDashboard: false }),
        createLayout(900),
      ),
    ).toBeUndefined();
  });

  it.each([false, "rotate-45", "rotate-90"] as const)(
    "leaves %s labels unchanged",
    (axisEnabledSetting) => {
      expect(
        getNumericAxisPadding(createAxis(), {
          ...createLayout(900),
          axisEnabledSetting,
        }),
      ).toBeUndefined();
    },
  );

  it.each<Extent>([
    [7, 7],
    [0, Infinity],
  ])("leaves an unsupported extent %s..%s unchanged", (min, max) => {
    expect(
      getNumericAxisPadding(
        createAxis({ extent: [min, max] }),
        createLayout(900),
      ),
    ).toBeUndefined();
  });

  it("falls back when endpoint labels cannot both fit", () => {
    expect(
      getNumericAxisPadding(createAxis(), createLayout(30)),
    ).toBeUndefined();
  });
});
