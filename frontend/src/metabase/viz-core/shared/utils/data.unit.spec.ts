import {
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import type {
  BreakoutChartColumns,
  MultipleMetricsChartColumns,
} from "../../lib/graph/columns";

import { type ColumnFormatter, getSeries } from "./data";

const columnFormatter: ColumnFormatter = (value: any) => String(value);

const dimensionColumn = createMockColumn({ name: "year" });
const breakoutColumn = createMockColumn({ name: "category" });
const countMetricColumn = createMockColumn({
  base_type: "type/Number",
  name: "count",
});
const avgMetricColumn = createMockColumn({
  base_type: "type/Number",
  name: "avg",
});

const rows = [
  [2020, "Doohickey", 400, 90],
  [2020, "Gadget", 450, 100],
  [2021, "Doohickey", 500, 110],
  [2021, "Gadget", 550, 120],
];

const breakoutChartColumns: BreakoutChartColumns = {
  dimension: {
    column: dimensionColumn,
    index: 0,
  },
  breakout: {
    column: breakoutColumn,
    index: 1,
  },
  metric: {
    column: countMetricColumn,
    index: 2,
  },
};

const multipleMetricsChartColumns: MultipleMetricsChartColumns = {
  dimension: {
    column: dimensionColumn,
    index: 0,
  },
  metrics: [
    {
      column: countMetricColumn,
      index: 2,
    },
    {
      column: avgMetricColumn,
      index: 3,
    },
  ],
};

describe("data utils", () => {
  describe("getSeries", () => {
    describe("chart with breakout", () => {
      it("should return series for each breakout value", () => {
        const data = createMockDatasetData({
          cols: [dimensionColumn, breakoutColumn, countMetricColumn],
          rows,
        });

        const series = getSeries(
          data,
          breakoutChartColumns,
          columnFormatter,
          createMockVisualizationSettings(),
        );

        expect(series).toHaveLength(2);
        expect(series[0]).toMatchObject({
          seriesKey: "Doohickey",
          seriesName: "Doohickey",
          seriesInfo: {
            metricColumn: countMetricColumn,
            dimensionColumn: dimensionColumn,
            breakoutValue: "Doohickey",
          },
        });
        expect(series[1]).toMatchObject({
          seriesKey: "Gadget",
          seriesName: "Gadget",
          seriesInfo: {
            metricColumn: countMetricColumn,
            dimensionColumn: dimensionColumn,
            breakoutValue: "Gadget",
          },
        });
      });
    });

    describe("chart with multiple metrics", () => {
      it("should return series for each metric", () => {
        const data = createMockDatasetData({
          cols: [
            dimensionColumn,
            breakoutColumn,
            countMetricColumn,
            avgMetricColumn,
          ],
          rows,
        });

        const series = getSeries(
          data,
          multipleMetricsChartColumns,
          columnFormatter,
          createMockVisualizationSettings(),
        );

        expect(series).toHaveLength(2);
        expect(series[0]).toMatchObject({
          seriesKey: "count",
          seriesName: "Column",
          seriesInfo: {
            dimensionColumn: dimensionColumn,
            metricColumn: countMetricColumn,
          },
        });
        expect(series[1]).toMatchObject({
          seriesKey: "avg",
          seriesName: "Column",
          seriesInfo: {
            dimensionColumn: dimensionColumn,
            metricColumn: avgMetricColumn,
          },
        });
      });
    });

    describe("with untranslatedRows", () => {
      it("should use untranslated breakout values for series keys and translated for display", () => {
        const data = createMockDatasetData({
          cols: [dimensionColumn, breakoutColumn, countMetricColumn],
          rows: [
            [2020, "Appareil", 400, 90],
            [2020, "Bidule", 450, 100],
            [2021, "Appareil", 500, 110],
            [2021, "Bidule", 550, 120],
          ],
          untranslatedRows: rows,
        });

        const series = getSeries(
          data,
          breakoutChartColumns,
          columnFormatter,
          createMockVisualizationSettings(),
        );

        expect(series).toHaveLength(2);
        expect(series[0]).toMatchObject({
          seriesKey: "Doohickey",
          seriesName: "Appareil",
          seriesInfo: {
            breakoutValue: "Doohickey",
          },
        });
        expect(series[1]).toMatchObject({
          seriesKey: "Gadget",
          seriesName: "Bidule",
          seriesInfo: {
            breakoutValue: "Gadget",
          },
        });
      });

      it("should apply custom title from settings using untranslated keys", () => {
        const data = createMockDatasetData({
          cols: [dimensionColumn, breakoutColumn, countMetricColumn],
          rows: [
            [2020, "Appareil", 400, 90],
            [2020, "Bidule", 450, 100],
            [2021, "Appareil", 500, 110],
            [2021, "Bidule", 550, 120],
          ],
          untranslatedRows: rows,
        });

        const settings = createMockVisualizationSettings({
          series_settings: {
            Doohickey: { title: "Custom Name" },
          },
        });

        const series = getSeries(
          data,
          breakoutChartColumns,
          columnFormatter,
          settings,
        );

        expect(series[0]).toMatchObject({
          seriesKey: "Doohickey",
          seriesName: "Custom Name",
        });
        expect(series[1]).toMatchObject({
          seriesKey: "Gadget",
          seriesName: "Bidule",
        });
      });
    });

    describe("custom series titles", () => {
      it("should apply custom title from settings for breakout series", () => {
        const data = createMockDatasetData({
          cols: [dimensionColumn, breakoutColumn, countMetricColumn],
          rows,
        });

        const settings = createMockVisualizationSettings({
          series_settings: {
            Doohickey: { title: "Custom Doohickey Title" },
            Gadget: { title: "Custom Gadget Title" },
          },
        });

        const series = getSeries(
          data,
          breakoutChartColumns,
          columnFormatter,
          settings,
        );

        expect(series[0].seriesName).toBe("Custom Doohickey Title");
        expect(series[1].seriesName).toBe("Custom Gadget Title");
      });

      it("should apply custom title from settings for multiple metrics series", () => {
        const data = createMockDatasetData({
          cols: [
            dimensionColumn,
            breakoutColumn,
            countMetricColumn,
            avgMetricColumn,
          ],
          rows,
        });

        const settings = createMockVisualizationSettings({
          series_settings: {
            count: { title: "Custom Total Count" },
            avg: { title: "Custom Average Value" },
          },
        });

        const series = getSeries(
          data,
          multipleMetricsChartColumns,
          columnFormatter,
          settings,
        );

        expect(series[0].seriesName).toBe("Custom Total Count");
        expect(series[1].seriesName).toBe("Custom Average Value");
      });
    });
  });
});
