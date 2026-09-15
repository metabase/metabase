import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

import type { Extent } from "../../../types";

import { getXAxisExtentWithPadding, getXAxisInsets } from "./x-axis-extent";

echarts.use([BarChart, LineChart, ScatterChart, GridComponent, SVGRenderer]);

type Scenario = {
  name: string;
  extent: Extent;
  axisWidth: number;
  paddingLeft: number;
  paddingRight: number;
};

const scenarios: Scenario[] = [
  {
    name: "small positive range",
    extent: [10, 100],
    axisWidth: 200,
    paddingLeft: 8,
    paddingRight: 8,
  },
  {
    name: "medium negative range",
    extent: [-200, -100],
    axisWidth: 300,
    paddingLeft: 16,
    paddingRight: 16,
  },
  {
    name: "large mixed-sign range",
    extent: [-70, 30],
    axisWidth: 900,
    paddingLeft: 24,
    paddingRight: 24,
  },
  {
    name: "asymmetric endpoint labels",
    extent: [0, 3],
    axisWidth: 1000,
    paddingLeft: 54,
    paddingRight: 39,
  },
  {
    name: "date-like values with asymmetric padding",
    extent: [Date.UTC(2026, 0, 1), Date.UTC(2026, 11, 1)],
    axisWidth: 640,
    paddingLeft: 48,
    paddingRight: 72,
  },
  {
    name: "unpadded left endpoint",
    extent: [0.01, 0.09],
    axisWidth: 320,
    paddingLeft: 0,
    paddingRight: 32,
  },
  {
    name: "unpadded right endpoint",
    extent: [10000, 120000],
    axisWidth: 400,
    paddingLeft: 32,
    paddingRight: 0,
  },
];

const seriesTypes: ("line" | "bar" | "scatter")[] = ["line", "bar", "scatter"];

describe("getXAxisExtentWithPadding", () => {
  describe.each(scenarios)(
    "$name",
    ({ extent, axisWidth, paddingLeft, paddingRight }) => {
      it.each(seriesTypes)(
        "places %s endpoints at the requested pixel insets (UXW-5182)",
        (seriesType) => {
          const paddedExtent = getXAxisExtentWithPadding(
            extent,
            axisWidth,
            paddingLeft,
            paddingRight,
          );

          expect(paddedExtent).toBeDefined();
          if (!paddedExtent) {
            return;
          }

          const gridLeft = 52;
          const gridRight = 28;
          const chart = echarts.init(null, undefined, {
            renderer: "svg",
            ssr: true,
            width: axisWidth + gridLeft + gridRight,
            height: 300,
          });

          try {
            chart.setOption({
              animation: false,
              grid: {
                left: gridLeft,
                right: gridRight,
                top: 0,
                bottom: 0,
                outerBoundsMode: "none",
              },
              xAxis: {
                type: "value",
                show: false,
                containShape: false,
                min: paddedExtent[0],
                max: paddedExtent[1],
              },
              yAxis: { type: "value", show: false },
              series: [
                {
                  type: seriesType,
                  data: [
                    [extent[0], 1],
                    [extent[1], 2],
                  ],
                },
              ],
            });

            expect(
              chart.convertToPixel({ xAxisIndex: 0 }, extent[0]),
            ).toBeCloseTo(gridLeft + paddingLeft, 6);
            expect(
              chart.convertToPixel({ xAxisIndex: 0 }, extent[1]),
            ).toBeCloseTo(gridLeft + axisWidth - paddingRight, 6);
          } finally {
            chart.dispose();
          }
        },
      );
    },
  );

  it("preserves an unpadded extent", () => {
    const extent: Extent = [10, 100];

    expect(getXAxisExtentWithPadding(extent, 300, 0, 0)).toEqual(extent);
  });

  const invalidScenarios: (Partial<Scenario> & Pick<Scenario, "name">)[] = [
    { name: "constant extent", extent: [7, 7] },
    { name: "reversed extent", extent: [10, -10] },
    { name: "infinite lower bound", extent: [-Infinity, 10] },
    { name: "infinite upper bound", extent: [0, Infinity] },
    { name: "NaN bound", extent: [NaN, 10] },
    { name: "negative left padding", paddingLeft: -1 },
    { name: "negative right padding", paddingRight: -1 },
    { name: "infinite padding", paddingLeft: Infinity },
    { name: "NaN padding", paddingRight: NaN },
    { name: "infinite width", axisWidth: Infinity },
    { name: "NaN width", axisWidth: NaN },
    { name: "zero width", axisWidth: 0, paddingLeft: 0, paddingRight: 0 },
    { name: "no remaining width", axisWidth: 32 },
    { name: "padding exceeds width", axisWidth: 30 },
    {
      name: "overflowing domain",
      extent: [-Number.MAX_VALUE, Number.MAX_VALUE],
    },
  ];

  it.each(invalidScenarios)(
    "falls back for $name",
    ({
      extent = [0, 10],
      axisWidth = 300,
      paddingLeft = 16,
      paddingRight = 16,
    }) => {
      expect(
        getXAxisExtentWithPadding(extent, axisWidth, paddingLeft, paddingRight),
      ).toBeUndefined();
    },
  );
});

describe("getXAxisInsets", () => {
  it("fits unequal labels on a small two-bar chart without taking more than half the plot (UXW-5182)", () => {
    const fit = getXAxisInsets(197, 8, 50, 83, 1, 0.8);
    expect(fit).toBeDefined();
    if (!fit) {
      return;
    }
    expect(fit.step).toBeGreaterThan(197 / 2);
    expect(fit.insetLeft - fit.step * 0.4).toBeCloseTo(8, 6);
    expect(fit.insetRight - 83 / 2).toBeCloseTo(8, 6);
    expect(fit.insetLeft + fit.step + fit.insetRight).toBeCloseTo(197, 6);
  });

  it("fits a bar on one side and a wider label on the other (UXW-5182)", () => {
    expect(getXAxisInsets(300, 16, 20, 80, 2, 0.8)).toEqual({
      step: 95,
      insetLeft: 54,
      insetRight: 56,
    });
  });

  it.each([79.999, 80, 80.001])(
    "matches the numerical fit when the first label width %f crosses the bar width (UXW-5182)",
    (firstLabelWidth) => {
      const analytic = getXAxisInsets(312, 16, firstLabelWidth, 20, 2, 0.8);
      const numeric = getXAxisInsets(
        312,
        16,
        firstLabelWidth,
        20,
        2,
        0.8,
        (step) => 0.8 * step,
      );
      expect(analytic).toBeDefined();
      expect(numeric).toBeDefined();
      if (!analytic || !numeric) {
        return;
      }
      expect(numeric.step).toBeCloseTo(analytic.step, 6);
      expect(numeric.insetLeft).toBeCloseTo(analytic.insetLeft, 6);
      expect(numeric.insetRight).toBeCloseTo(analytic.insetRight, 6);
      expect(
        analytic.insetLeft + 2 * analytic.step + analytic.insetRight,
      ).toBeCloseTo(312, 6);
    },
  );

  it("uses a clamped box width instead of reserving a full proportional band (UXW-5182)", () => {
    const fit = getXAxisInsets(900, 24, 20, 80, 2, 0.8, (step) =>
      Math.max(3, Math.min(0.7 * step, 60)),
    );
    expect(fit).toBeDefined();
    if (!fit) {
      return;
    }
    expect(fit.step).toBeCloseTo(391, 6);
    expect(fit.insetLeft).toBeCloseTo(54, 6);
    expect(fit.insetRight).toBeCloseTo(64, 6);
  });

  it("keeps dense clamped boxes inside wider endpoint labels (UXW-5182)", () => {
    const fit = getXAxisInsets(300, 16, 20, 80, 100, 0.8, (step) =>
      Math.max(3, Math.min(0.7 * step, 60)),
    );
    expect(fit).toBeDefined();
    if (!fit) {
      return;
    }
    expect(fit.step).toBeCloseTo(2.18, 6);
    expect(fit.insetLeft).toBeCloseTo(26, 6);
    expect(fit.insetRight).toBeCloseTo(56, 6);
  });

  it.each([Infinity, NaN, -1, 1000])(
    "falls back when the custom mark width %s cannot fit",
    (markWidth) => {
      expect(
        getXAxisInsets(300, 16, 20, 80, 2, 0.8, () => markWidth),
      ).toBeUndefined();
    },
  );
});
