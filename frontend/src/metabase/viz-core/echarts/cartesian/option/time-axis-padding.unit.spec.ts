import { LineChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { platformApi } from "zrender/lib/core/platform.js";

import {
  createMockChartLayout,
  measureTextEChartsAdapter,
  measureTextWidth,
} from "__support__/echarts";
import { dayjs } from "metabase/dayjs";

import type { Extent } from "../../../types";
import type { TimeSeriesInterval } from "../model/types";
import { computeTimeseriesTicksInterval } from "../utils/timeseries";

import { getTimeAxisLabelValues } from "./time-axis-padding";
import { getXAxisExtentWithPadding } from "./x-axis-extent";
import { getXAxisLabelPadding } from "./x-axis-padding";

echarts.use([LineChart, GridComponent, SVGRenderer]);

const units: TimeSeriesInterval["unit"][] = [
  "second",
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
];

const cases = units.flatMap((unit) =>
  [2, 7, 31].flatMap((valuesCount) =>
    [200, 320, 965].map((width) => ({ unit, valuesCount, width })),
  ),
);

const getLabelWidth = (text: string) => measureTextWidth(text, 12, 400);

function formatDate(value: number, unit: TimeSeriesInterval["unit"]): string {
  const date = dayjs.utc(value);
  if (unit === "year") {
    return date.format("YYYY");
  }
  if (unit === "quarter") {
    return `Q${date.quarter()} ${date.year()}`;
  }
  if (unit === "month") {
    return date.format("MMM YYYY");
  }
  if (unit === "day" || unit === "week") {
    return date.format("MMM D");
  }
  if (unit === "second") {
    return date.format("HH:mm:ss");
  }
  return date.format("HH:mm");
}

describe("getTimeAxisLabelValues", () => {
  it.each(cases)(
    "keeps both $unit endpoints for $valuesCount values at $width px (UXW-5182)",
    ({ unit, valuesCount, width }) => {
      const first = dayjs.utc("2025-04-01").startOf(unit);
      const last = first.add(
        (valuesCount - 1) * (unit === "quarter" ? 3 : 1),
        unit === "quarter" ? "month" : unit,
      );
      const extent: Extent = [first.valueOf(), last.valueOf()];
      const padding = getXAxisLabelPadding(width);
      const paddedExtent = getXAxisExtentWithPadding(
        extent,
        width,
        padding,
        padding,
      );
      expect(paddedExtent).toBeDefined();
      if (!paddedExtent) {
        return;
      }

      const formatLabel = (value: number) => formatDate(value, unit);
      const layout = createMockChartLayout({
        outerWidth: width,
        ticksDimensions: { getXTickWidth: getLabelWidth },
      });
      const computedInterval = computeTimeseriesTicksInterval(
        extent,
        { unit, count: 1 },
        layout,
        (value) => formatLabel(dayjs.utc(String(value)).valueOf()),
      );
      const values = getTimeAxisLabelValues(
        extent,
        paddedExtent,
        computedInterval,
        layout,
        formatLabel,
      );
      expect(values).toBeDefined();
      if (!values) {
        return;
      }
      expect(values[0]).toBe(extent[0]);
      expect(values?.at(-1)).toBe(extent[1]);
      expect(
        values?.every((value) => value >= extent[0] && value <= extent[1]),
      ).toBe(true);
      expect(new Set(values).size).toBe(values?.length);

      const previousMeasureText = platformApi.measureText;
      echarts.setPlatformAPI({ measureText: measureTextEChartsAdapter });
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
          xAxis: {
            type: "time",
            min: paddedExtent[0],
            max: paddedExtent[1],
            containShape: false,
            axisLabel: {
              customValues: values,
              formatter: formatLabel,
              hideOverlap: false,
              showMinLabel: true,
              showMaxLabel: true,
              alignMinLabel: "left",
              alignMaxLabel: "right",
              fontFamily: "Lato",
              fontSize: 12,
              fontWeight: 400,
            },
          },
          yAxis: { show: false },
          series: [{ type: "line", data: extent.map((value) => [value, 1]) }],
        });
        chart.renderToSVGString();
        const labels = chart
          .getZr()
          .storage.getDisplayList(true)
          .filter(
            (element) =>
              element.type === "tspan" &&
              typeof element.style.text === "string" &&
              element.style.text.trim(),
          )
          .map((label) => {
            const bounds = label.getBoundingRect().clone();
            if (label.transform) {
              bounds.applyTransform(label.transform);
            }
            return bounds;
          })
          .sort((left, right) => left.x - right.x);
        expect(labels).toHaveLength(values.length);
        expect(labels[0].x).toBeCloseTo(padding, 0);
        expect(
          width - labels[labels.length - 1].x - labels[labels.length - 1].width,
        ).toBeCloseTo(padding, 0);
        expect(chart.convertToPixel({ xAxisIndex: 0 }, extent[0])).toBeCloseTo(
          padding,
          0,
        );
        expect(chart.convertToPixel({ xAxisIndex: 0 }, extent[1])).toBeCloseTo(
          width - padding,
          0,
        );
      } finally {
        chart.dispose();
        echarts.setPlatformAPI({ measureText: previousMeasureText });
      }
    },
  );

  it.each([
    {
      start: "2025-02-15",
      end: "2025-11-15",
      unit: "quarter",
      count: 1,
      expected: ["2025-04-01 00:00", "2025-07-01 00:00", "2025-10-01 00:00"],
    },
    {
      start: "2025-02-15",
      end: "2026-11-15",
      unit: "quarter",
      count: 2,
      expected: ["2025-07-01 00:00", "2026-01-01 00:00", "2026-07-01 00:00"],
    },
    {
      start: "2025-02-15",
      end: "2025-11-15",
      unit: "month",
      count: 3,
      expected: ["2025-04-01 00:00", "2025-07-01 00:00", "2025-10-01 00:00"],
    },
    {
      start: "2026-07-10",
      end: "2041-08-22",
      unit: "year",
      count: 5,
      expected: ["2030-01-01 00:00", "2035-01-01 00:00", "2040-01-01 00:00"],
    },
    {
      start: "2025-02-15T13:07:23Z",
      end: "2025-02-15T23:23:45Z",
      unit: "hour",
      count: 3,
      expected: ["2025-02-15 15:00", "2025-02-15 18:00", "2025-02-15 21:00"],
    },
  ] satisfies {
    start: string;
    end: string;
    unit: TimeSeriesInterval["unit"];
    count: number;
    expected: string[];
  }[])(
    "aligns $count $unit ticks to calendar boundaries from $start",
    ({ start, end, unit, count, expected }) => {
      const extent: Extent = [
        dayjs.utc(start).valueOf(),
        dayjs.utc(end).valueOf(),
      ];
      const formatLabel = (value: number) =>
        dayjs.utc(value).format("YYYY-MM-DD HH:mm");
      const values = getTimeAxisLabelValues(
        extent,
        extent,
        { unit, count },
        createMockChartLayout({
          outerWidth: 4000,
          ticksDimensions: { getXTickWidth: getLabelWidth },
        }),
        formatLabel,
      );
      expect(values?.[0]).toBe(extent[0]);
      expect(values?.at(-1)).toBe(extent[1]);
      expect(values?.slice(1, -1).map(formatLabel)).toEqual(expected);
    },
  );

  it("keeps Monday weekly ticks across month boundaries", () => {
    const extent: Extent = [
      dayjs.utc("2025-03-24").valueOf(),
      dayjs.utc("2025-05-12").valueOf(),
    ];
    const values = getTimeAxisLabelValues(
      extent,
      extent,
      { unit: "week", count: 1 },
      createMockChartLayout({ outerWidth: 965 }),
      (value) => dayjs.utc(value).format("MMM D"),
    );
    expect(values).toBeDefined();
    expect(values?.every((value) => dayjs.utc(value).day() === 1)).toBe(true);
  });

  it("keeps real endpoints while a coarser formatter removes duplicate months", () => {
    const extent: Extent = [
      dayjs.utc("2025-03-30").valueOf(),
      dayjs.utc("2025-10-26").valueOf(),
    ];
    const formatLabel = (value: number) => dayjs.utc(value).format("MMM YYYY");
    const values = getTimeAxisLabelValues(
      extent,
      extent,
      { unit: "month", count: 1 },
      createMockChartLayout({
        outerWidth: 965,
        ticksDimensions: { getXTickWidth: getLabelWidth },
      }),
      formatLabel,
    );
    expect(values?.[0]).toBe(extent[0]);
    expect(values?.at(-1)).toBe(extent[1]);
    expect(values?.map(formatLabel)).toEqual([
      "Mar 2025",
      "May 2025",
      "Jun 2025",
      "Jul 2025",
      "Aug 2025",
      "Sep 2025",
      "Oct 2025",
    ]);
  });

  it("retains irregular timestamps without rounding them to calendar boundaries", () => {
    const extent: Extent = [
      dayjs.utc("2025-03-08T13:07:41-05:00").valueOf(),
      dayjs.utc("2025-03-11T14:23:15-04:00").valueOf(),
    ];
    const values = getTimeAxisLabelValues(
      extent,
      extent,
      { unit: "hour", count: 12 },
      createMockChartLayout({ outerWidth: 965 }),
      (value) => dayjs.utc(value).format("MMM D HH:mm:ss"),
    );
    expect(values?.[0]).toBe(extent[0]);
    expect(values?.at(-1)).toBe(extent[1]);
  });

  it("bounds formatting for an extremely dense time range", () => {
    const formatLabel = jest.fn((value: number) =>
      dayjs.utc(value).format("HH:mm:ss.SSS"),
    );
    const extent: Extent = [
      dayjs.utc("2025-01-01").valueOf(),
      dayjs.utc("2026-01-01").valueOf(),
    ];
    const values = getTimeAxisLabelValues(
      extent,
      extent,
      { unit: "ms", count: 1 },
      createMockChartLayout({ outerWidth: 965 }),
      formatLabel,
    );
    expect(values?.[0]).toBe(extent[0]);
    expect(values?.at(-1)).toBe(extent[1]);
    expect(formatLabel.mock.calls.length).toBeLessThanOrEqual(50);
  });

  it.each<Extent>([
    [1, 1],
    [2, 1],
    [NaN, 1],
    [0, Infinity],
  ])(
    "does not create ticks for an invalid or degenerate extent %s..%s",
    (min, max) => {
      expect(
        getTimeAxisLabelValues(
          [min, max],
          [min, max],
          { unit: "day", count: 1 },
          createMockChartLayout(),
          String,
        ),
      ).toBeUndefined();
    },
  );
});
