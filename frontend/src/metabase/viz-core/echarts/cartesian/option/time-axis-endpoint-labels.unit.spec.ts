import { createMockChartLayout } from "__support__/echarts";
import { dayjs } from "metabase/dayjs";

import type { TimeSeriesXAxisModel } from "../model/types";

import { getTimeAxisEndpointLabelOptions } from "./time-axis-endpoint-labels";

const LABEL_WIDTH = 80;
const PLOT_WIDTH = 900;
const LARGE_PLOT_INSET = 24;

const utc = (value: string) => dayjs.utc(value);
const formatLabel = (value: number) => dayjs.utc(value).format("MMMM YYYY");

const createMonthlyAxis = (
  start: string,
  intervalsCount: number,
): TimeSeriesXAxisModel => ({
  axisType: "time",
  interval: { unit: "month", count: 1 },
  intervalsCount,
  range: [utc(start), utc(start).add(intervalsCount, "month")],
  formatter: (value) => String(value),
  toEChartsAxisValue: (value) =>
    dayjs.utc(String(value)).format("YYYY-MM-DDTHH:mm:ss[Z]"),
  fromEChartsAxisValue: (value) => dayjs.utc(value),
});

const setup = ({
  axis = createMonthlyAxis("2025-04-01", 48),
  boundaryWidth = PLOT_WIDTH,
  labelWidth = LABEL_WIDTH,
  axisEnabledSetting = true as const,
  hasBarSeries = false,
}: {
  axis?: TimeSeriesXAxisModel;
  boundaryWidth?: number;
  labelWidth?: number;
  axisEnabledSetting?: "compact" | "rotate-45" | "rotate-90" | boolean;
  hasBarSeries?: boolean;
} = {}) =>
  getTimeAxisEndpointLabelOptions(
    axis,
    createMockChartLayout({
      boundaryWidth,
      axisEnabledSetting,
      ticksDimensions: { getXTickWidth: () => labelWidth },
    }),
    formatLabel,
    hasBarSeries,
  );

const toLabels = (values: number[] | undefined) =>
  values?.map((value) => formatLabel(value));

describe("getTimeAxisEndpointLabelOptions", () => {
  it("pins both data endpoints and uses the smallest calendar step that divides the range and fits", () => {
    const options = setup();

    expect(toLabels(options.customValues)).toEqual([
      "April 2025",
      "April 2026",
      "April 2027",
      "April 2028",
      "April 2029",
    ]);
  });

  it("falls back to evenly spaced data points when no calendar step divides the range", () => {
    const options = setup({ axis: createMonthlyAxis("2025-04-01", 49) });
    const values = options.customValues ?? [];
    const months = values.map((value) =>
      dayjs.utc(value).diff(utc("2025-04-01"), "month"),
    );

    expect(months[0]).toBe(0);
    expect(months[months.length - 1]).toBe(49);
    const steps = months.slice(1).map((month, index) => month - months[index]);
    // Snapping to whole months can only make neighbouring steps differ by one.
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThanOrEqual(1);
    expect(steps.length).toBeGreaterThan(2);
  });

  it("aligns the endpoint labels inward and pads them to the inset for dense data", () => {
    const options = setup();
    // The first data point sits half an interval (about 9px) from the plot edge.
    const firstPointOffset = (0.5 / (48 + 1)) * PLOT_WIDTH;

    expect(options).toMatchObject({
      showMinLabel: true,
      showMaxLabel: true,
      alignMinLabel: "left",
      alignMaxLabel: "right",
    });
    expect(options.padding).toEqual([
      0,
      expect.closeTo(LARGE_PLOT_INSET - firstPointOffset, 5),
    ]);
  });

  it("keeps sparse endpoints centered on their data points when they already clear the inset", () => {
    const options = setup({ axis: createMonthlyAxis("2025-04-01", 4) });

    expect(options.padding).toBeUndefined();
    expect(options.alignMinLabel).toBeUndefined();
    expect(options.alignMaxLabel).toBeUndefined();
    expect(toLabels(options.customValues)).toEqual([
      "April 2025",
      "May 2025",
      "June 2025",
      "July 2025",
      "August 2025",
    ]);
  });

  it("treats bar endpoints as a full interval from the edge, as ECharts expands bar axes", () => {
    // 12 monthly intervals: without bars the first point is ~35px in and a 60px
    // label would cross the 24px inset; with bars it is ~64px in and clears it.
    const axis = createMonthlyAxis("2025-04-01", 12);

    expect(setup({ axis, labelWidth: 60 }).alignMinLabel).toBe("left");
    expect(
      setup({ axis, labelWidth: 60, hasBarSeries: true }).alignMinLabel,
    ).toBeUndefined();
  });

  it("keeps only the first label when the two endpoint labels cannot both fit", () => {
    const options = setup({ boundaryWidth: 120, labelWidth: 80 });

    expect(toLabels(options.customValues)).toEqual(["April 2025"]);
  });

  it.each(["rotate-45", "rotate-90", false] as const)(
    "leaves %s axes to the default layout",
    (axisEnabledSetting) => {
      expect(setup({ axisEnabledSetting })).toEqual({});
    },
  );

  it("leaves a single data point to the default layout", () => {
    expect(setup({ axis: createMonthlyAxis("2025-04-01", 0) })).toEqual({});
  });
});
