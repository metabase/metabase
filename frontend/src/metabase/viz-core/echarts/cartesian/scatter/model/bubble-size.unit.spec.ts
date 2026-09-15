import { ScatterChart } from "echarts/charts";
import { DatasetComponent, GridComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

import { createMockSeriesModel } from "__support__/echarts";
import { dayjs } from "metabase/dayjs";
import { color } from "metabase/ui/colors";

import { DEFAULT_VISUALIZATION_THEME } from "../../../../shared/utils/theme";
import type { RenderingContext } from "../../../../types";
import { X_AXIS_DATA_KEY } from "../../constants/dataset";
import type {
  CategoryXAxisModel,
  ChartDataset,
  NumericXAxisModel,
  TimeSeriesXAxisModel,
} from "../../model/types";
import { getXAxisPositions } from "../../model/x-axis-position";
import { buildEChartsScatterSeries } from "../option/series";

import { getScatterXAxisEndMarkWidths } from "./bubble-size";

echarts.use([ScatterChart, DatasetComponent, GridComponent, SVGRenderer]);

const renderingContext: RenderingContext = {
  getColor: color,
  measureText: () => 0,
  measureTextHeight: () => 0,
  fontFamily: "Lato",
  theme: DEFAULT_VISUALIZATION_THEME,
};
const bubbleSeries = createMockSeriesModel({
  dataKey: "value",
  bubbleSizeDataKey: "size",
});
const categoryAxis: CategoryXAxisModel = {
  axisType: "category",
  isDashboard: true,
  isHistogram: false,
  valuesCount: 3,
  formatter: String,
};

const getCategoryAxis = (dataset: ChartDataset): CategoryXAxisModel => ({
  ...categoryAxis,
  positions: getXAxisPositions(dataset, categoryAxis),
});

describe("scatter endpoint marker widths", () => {
  it.each([
    { name: "large first bubble", firstSize: 100, middleSize: 20, lastSize: 0 },
    { name: "large middle bubble", firstSize: 0, middleSize: 100, lastSize: 0 },
  ])(
    "matches rendered endpoint symbols with a $name",
    ({ firstSize, middleSize, lastSize }) => {
      const dataset: ChartDataset = [
        { [X_AXIS_DATA_KEY]: "A", value: 10, size: firstSize },
        { [X_AXIS_DATA_KEY]: "B", value: 20, size: middleSize },
        { [X_AXIS_DATA_KEY]: "C", value: 30, size: lastSize },
      ];
      const widths = getScatterXAxisEndMarkWidths(
        dataset,
        [bubbleSeries],
        [0, 100],
        getCategoryAxis(dataset),
      );
      const series = buildEChartsScatterSeries(
        bubbleSeries,
        [0, 100],
        0,
        renderingContext,
      );
      const chart = echarts.init(null, undefined, {
        renderer: "svg",
        ssr: true,
        width: 600,
        height: 300,
      });

      try {
        chart.setOption({
          animation: false,
          dataset: { source: dataset },
          xAxis: { type: "category", show: false },
          yAxis: { type: "value", min: 0, max: 40, show: false },
          series: [series],
        });
        const symbols = chart
          .getZr()
          .storage.getDisplayList()
          .filter((element) => element.type === "path");
        const symbolWidths = symbols.map((element) => {
          const bounds = element.getBoundingRect().clone();
          if (element.transform) {
            bounds.applyTransform(element.transform);
          }
          return bounds.width;
        });

        expect(symbolWidths).toHaveLength(3);
        expect(widths?.first).toBeCloseTo(symbolWidths[0] - 1);
        expect(widths?.last).toBeCloseTo(symbolWidths[2] - 1);
        expect(widths?.first).toBeCloseTo(firstSize === 100 ? 75 : 15);
        expect(widths?.last).toBeCloseTo(15);
      } finally {
        chart.dispose();
      }
    },
  );

  it("uses the largest visible bubble at repeated endpoint categories", () => {
    const dataset: ChartDataset = [
      { [X_AXIS_DATA_KEY]: "A", value: 10, size: 0 },
      { [X_AXIS_DATA_KEY]: "B", value: 20, size: 0 },
      { [X_AXIS_DATA_KEY]: "A", value: 30, size: 100 },
      { [X_AXIS_DATA_KEY]: "C", value: 40, size: 0 },
      { [X_AXIS_DATA_KEY]: "B", value: 50, size: 100 },
    ];

    expect(
      getScatterXAxisEndMarkWidths(
        dataset,
        [bubbleSeries],
        [0, 100],
        getCategoryAxis(dataset),
      ),
    ).toEqual({
      first: 75,
      last: 15,
    });
  });

  it("ignores hidden series and missing endpoint values", () => {
    const dataset: ChartDataset = [
      { [X_AXIS_DATA_KEY]: "A", value: null, size: 100, hidden: 10 },
      { [X_AXIS_DATA_KEY]: "B", value: 20, size: 100 },
      { [X_AXIS_DATA_KEY]: "C", value: 30, size: 0, hidden: 40 },
    ];
    const hiddenSeries = createMockSeriesModel({
      dataKey: "hidden",
      bubbleSizeDataKey: "size",
      visible: false,
    });

    expect(
      getScatterXAxisEndMarkWidths(
        dataset,
        [bubbleSeries, hiddenSeries],
        [0, 100],
        getCategoryAxis(dataset),
      ),
    ).toEqual({ first: 0, last: 15 });
  });

  it("uses fixed15px symbols when no bubble-size metric is selected", () => {
    const dataset: ChartDataset = [
      { [X_AXIS_DATA_KEY]: "A", value: 10 },
      { [X_AXIS_DATA_KEY]: "B", value: 20 },
    ];
    const series = createMockSeriesModel({ dataKey: "value" });

    expect(
      getScatterXAxisEndMarkWidths(
        dataset,
        [series],
        null,
        getCategoryAxis(dataset),
      ),
    ).toEqual({ first: 15, last: 15 });
  });

  it("uses numeric domain extremes rather than dataset row order", () => {
    const dataset: ChartDataset = [
      { [X_AXIS_DATA_KEY]: 20, value: 10, size: 100 },
      { [X_AXIS_DATA_KEY]: 30, value: 20, size: 0 },
      { [X_AXIS_DATA_KEY]: 10, value: 30, size: 0 },
    ];
    const axis: NumericXAxisModel = {
      axisType: "value",
      isDashboard: true,
      extent: [10, 30],
      interval: 10,
      intervalsCount: 2,
      isPadded: false,
      formatter: String,
      toEChartsAxisValue: (value) => (typeof value === "number" ? value : null),
      fromEChartsAxisValue: (value) => value,
    };

    expect(
      getScatterXAxisEndMarkWidths(dataset, [bubbleSeries], [0, 100], axis),
    ).toEqual({ first: 15, last: 15 });
  });

  it("matches transformed time endpoints", () => {
    const range: TimeSeriesXAxisModel["range"] = [
      dayjs.utc("2025-01-01"),
      dayjs.utc("2025-03-01"),
    ];
    const axis: TimeSeriesXAxisModel = {
      axisType: "time",
      isDashboard: true,
      range,
      interval: { unit: "month", count: 1 },
      intervalsCount: 2,
      formatter: String,
      toEChartsAxisValue: (value) =>
        typeof value === "string"
          ? dayjs.utc(value).add(5, "hour").toISOString()
          : null,
      fromEChartsAxisValue: (value) => dayjs.utc(value),
    };
    const dataset: ChartDataset = [
      { [X_AXIS_DATA_KEY]: "2025-01-01T05:00:00.000Z", value: 10, size: 100 },
      { [X_AXIS_DATA_KEY]: "2025-03-01T05:00:00.000Z", value: 20, size: 0 },
    ];

    expect(
      getScatterXAxisEndMarkWidths(dataset, [bubbleSeries], [0, 100], axis),
    ).toEqual({ first: 75, last: 15 });
  });

  it("does not add a marker layout override outside dashboards", () => {
    expect(
      getScatterXAxisEndMarkWidths([], [bubbleSeries], [0, 100], {
        ...categoryAxis,
        isDashboard: false,
      }),
    ).toBeUndefined();
  });
});
