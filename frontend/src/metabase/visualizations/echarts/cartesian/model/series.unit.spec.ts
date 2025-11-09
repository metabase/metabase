import type {
  BreakoutChartColumns,
  CartesianChartColumns,
} from "metabase/visualizations/lib/graph/columns";
import { SERIES_COLORS_SETTING_KEY } from "metabase/visualizations/shared/settings/series";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { SingleSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { getCardsSeriesModels } from "./series";

const createMockComputedVisualizationSettings = (
  opts: Partial<ComputedVisualizationSettings> = {},
) => {
  return createMockVisualizationSettings({
    series: () => ({}),
    ...opts,
  });
};

describe("series", () => {
  const metricColumns: CartesianChartColumns = {
    dimension: {
      index: 0,
      column: createMockColumn({ name: "month", display_name: "Month" }),
    },
    metrics: [
      {
        index: 2,
        column: createMockColumn({
          name: "count",
          display_name: "Count",
          base_type: "type/Integer",
        }),
      },
    ],
  };

  const metricSeries: SingleSeries = {
    card: createMockCard({ id: 1, name: "metric card" }),
    data: createMockDatasetData({
      rows: [
        [1, "category1", 200],
        [2, "category1", 300],
        [3, "category2", 400],
        [3, "category3", 500],
      ],
      cols: [
        metricColumns.dimension.column,
        createMockColumn({ name: "category", display_name: "Category" }),
        metricColumns.metrics[0].column,
      ],
    }),
  };

  const breakoutColumns: BreakoutChartColumns = {
    dimension: {
      index: 0,
      column: createMockColumn({
        name: "also_month",
        display_name: "Also Month",
      }),
    },
    metric: {
      index: 2,
      column: createMockColumn({
        name: "count",
        display_name: "Count",
        base_type: "type/Integer",
      }),
    },
    breakout: {
      index: 1,
      column: createMockColumn({ name: "type", display_name: "Type" }),
    },
  };

  const breakoutSeries: SingleSeries = {
    card: createMockCard({ id: 2, name: "breakout card" }),
    data: createMockDatasetData({
      rows: [
        [1, "type1", 100],
        [2, "type1", 200],
        [3, "type2", 300],
        [3, "type2", 400],
      ],
      cols: [
        breakoutColumns.dimension.column,
        breakoutColumns.breakout.column,
        breakoutColumns.metric.column,
      ],
    }),
  };

  describe("getCardsSeriesModels", () => {
    describe("single metric card", () => {
      it("should return a series model with default names", () => {
        const rawSeries = [metricSeries];
        const cardsColumns = [metricColumns];

        const result = getCardsSeriesModels(
          rawSeries,
          cardsColumns,
          [],
          createMockComputedVisualizationSettings(),
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          cardId: metricSeries.card.id,
          column: metricColumns.metrics[0].column,
          columnIndex: metricColumns.metrics[0].index,
          dataKey: "1:count",
          legacySeriesSettingsObjectKey: {
            card: { _seriesKey: metricColumns.metrics[0].column.name },
          },
          name: metricColumns.metrics[0].column.display_name,
          tooltipName: metricColumns.metrics[0].column.display_name,
          vizSettingsKey: metricColumns.metrics[0].column.name,
          visible: true,
        });
      });

      it("should return a series model with overridden name", () => {
        const rawSeries = [metricSeries];
        const cardsColumns = [metricColumns];

        const result = getCardsSeriesModels(
          rawSeries,
          cardsColumns,
          [],
          createMockComputedVisualizationSettings({
            series_settings: {
              [metricColumns.metrics[0].column.name]: {
                title: "foo",
              },
            },
          }),
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          dataKey: "1:count",
          name: "foo",
          tooltipName: "foo",
        });
      });

      it("should convert series colors to hex format (metabase#56232)", () => {
        const rawSeries = [metricSeries];
        const cardsColumns = [metricColumns];

        const result = getCardsSeriesModels(
          rawSeries,
          cardsColumns,
          [],
          createMockComputedVisualizationSettings({
            [SERIES_COLORS_SETTING_KEY]: {
              [metricColumns.metrics[0].column.name]: "hsla(358, 71%, 62%, 1)",
            },
          }),
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          dataKey: "1:count",
          color: "#E3595E",
        });
      });

      it("should mark series as invisible if it's dataKey is in hiddenSeries list", () => {
        const rawSeries = [metricSeries];
        const cardsColumns = [metricColumns];

        const result = getCardsSeriesModels(
          rawSeries,
          cardsColumns,
          ["1:count"],
          createMockComputedVisualizationSettings(),
        );

        expect(result).toHaveLength(1);
        expect(result[0].visible).toBe(false);
      });
    });

    describe("single breakout card", () => {
      it("should return a series model with default names", () => {
        const rawSeries = [breakoutSeries];
        const cardsColumns = [breakoutColumns];

        const result = getCardsSeriesModels(
          rawSeries,
          cardsColumns,
          [],
          createMockComputedVisualizationSettings(),
        );

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({
          cardId: breakoutSeries.card.id,
          column: breakoutColumns.metric.column,
          columnIndex: breakoutColumns.metric.index,
          dataKey: "2:count:type1",
          legacySeriesSettingsObjectKey: {
            card: { _seriesKey: "type1" },
          },
          name: "type1",
          tooltipName: breakoutColumns.metric.column.display_name,
          vizSettingsKey: "type1",
        });
        expect(result[1]).toMatchObject({
          cardId: breakoutSeries.card.id,
          column: breakoutColumns.metric.column,
          columnIndex: breakoutColumns.metric.index,
          dataKey: "2:count:type2",
          legacySeriesSettingsObjectKey: {
            card: { _seriesKey: "type2" },
          },
          name: "type2",
          tooltipName: breakoutColumns.metric.column.display_name,
          vizSettingsKey: "type2",
        });
      });

      it("should return a series model with overridden names", () => {
        const rawSeries = [breakoutSeries];
        const cardsColumns = [breakoutColumns];

        const result = getCardsSeriesModels(
          rawSeries,
          cardsColumns,
          [],
          createMockComputedVisualizationSettings({
            series_settings: {
              type2: {
                title: "foo",
              },
            },
          }),
        );

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({
          dataKey: "2:count:type1",
          name: "type1",
          tooltipName: breakoutColumns.metric.column.display_name,
        });
        expect(result[1]).toMatchObject({
          dataKey: "2:count:type2",
          name: "foo",
          tooltipName: "Count",
        });
      });

      it("when breakout values are null and '' should give (empty) series names", () => {
        const rawSeries = [
          {
            ...breakoutSeries,
            data: {
              ...breakoutSeries.data,
              rows: [
                [1, "", 100],
                [2, null, 200],
              ],
            },
          },
        ];
        const cardsColumns = [breakoutColumns];

        const result = getCardsSeriesModels(
          rawSeries,
          cardsColumns,
          [],
          createMockComputedVisualizationSettings(),
        );

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({
          dataKey: "2:count:",
          name: "(empty)",
          tooltipName: breakoutColumns.metric.column.display_name,
        });
        expect(result[1]).toMatchObject({
          dataKey: "2:count:null",
          name: "(empty)",
          tooltipName: "Count",
        });
      });
    });

    describe("combined cards", () => {
      const rawSeries = [metricSeries, breakoutSeries];
      const cardsColumns = [metricColumns, breakoutColumns];

      it("should return series models of two combined cards with default names", () => {
        const result = getCardsSeriesModels(
          rawSeries,
          cardsColumns,
          [],
          createMockComputedVisualizationSettings(),
        );

        expect(result).toHaveLength(3);
        expect(result[0]).toMatchObject({
          cardId: metricSeries.card.id,
          column: metricColumns.metrics[0].column,
          columnIndex: metricColumns.metrics[0].index,
          dataKey: "1:count",
          legacySeriesSettingsObjectKey: {
            card: { _seriesKey: metricColumns.metrics[0].column.name },
          },
          name: metricSeries.card.name,
          tooltipName: metricColumns.metrics[0].column.display_name,
          vizSettingsKey: metricColumns.metrics[0].column.name,
        });
        expect(result[1]).toMatchObject({
          cardId: breakoutSeries.card.id,
          column: breakoutColumns.metric.column,
          columnIndex: breakoutColumns.metric.index,
          dataKey: "2:count:type1",
          legacySeriesSettingsObjectKey: {
            card: { _seriesKey: "breakout card: type1" },
          },
          name: "breakout card: type1",
          tooltipName: breakoutColumns.metric.column.display_name,
          vizSettingsKey: "breakout card: type1",
        });
        expect(result[2]).toMatchObject({
          cardId: breakoutSeries.card.id,
          column: breakoutColumns.metric.column,
          columnIndex: breakoutColumns.metric.index,
          dataKey: "2:count:type2",
          legacySeriesSettingsObjectKey: {
            card: { _seriesKey: "breakout card: type2" },
          },
          name: "breakout card: type2",
          tooltipName: breakoutColumns.metric.column.display_name,
          vizSettingsKey: "breakout card: type2",
        });
      });

      it("should return series models of two combined cards with overridden names", () => {
        const result = getCardsSeriesModels(
          rawSeries,
          cardsColumns,
          [],
          createMockComputedVisualizationSettings({
            series_settings: {
              [metricColumns.metrics[0].column.name]: {
                title: "foo",
              },
              "breakout card: type2": {
                title: "bar",
              },
            },
          }),
        );

        expect(result).toHaveLength(3);
        expect(result[0]).toMatchObject({
          dataKey: "1:count",
          name: "foo",
          tooltipName: "foo",
        });
        expect(result[1]).toMatchObject({
          dataKey: "2:count:type1",
          name: "breakout card: type1",
          tooltipName: breakoutColumns.metric.column.display_name,
        });
        expect(result[2]).toMatchObject({
          dataKey: "2:count:type2",
          name: "bar",
          tooltipName: breakoutColumns.metric.column.display_name,
        });
      });
    });
  });
});
