import icepick from "icepick";

import {
  DateTimeColumn,
  NumberColumn,
  StringColumn,
} from "__support__/visualizations";
import {
  getComputedSettingsForSeries,
  getStoredSettingsForSeries,
} from "metabase/visualizations/lib/settings/visualization";
import registerVisualizations from "metabase/visualizations/register";
import type {
  Series,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

registerVisualizations();

describe("visualization_settings", () => {
  describe("getComputedSettingsForSeries", () => {
    describe("stackable.stack_type", () => {
      it("should default to unstacked stacked", () => {
        const settings = getComputedSettingsForSeries(
          cardWithTimeseriesBreakout({ unit: "month" }),
        );
        expect(settings["stackable.stack_type"]).toBe(null);
      });

      it("should default area chart to stacked for 1 dimensions and 2 metrics", () => {
        const settings = getComputedSettingsForSeries(
          cardWithTimeseriesBreakoutAndTwoMetrics({
            display: "area",
            unit: "month",
          }),
        );
        expect(settings["stackable.stack_type"]).toBe("stacked");
      });
    });

    describe("graph.x_axis._is_histogram", () => {
      // NOTE: currently datetimes with unit are never considered histograms
      const HISTOGRAM_UNITS: string[] = [];
      const NON_HISTOGRAM_UNITS = [
        // definitely not histogram
        "day-of-week",
        "month-of-year",
        "quarter-of-year",
        // arguably histogram but disabled for now
        "minute-of-hour",
        "hour-of-day",
        "day-of-month",
        "day-of-year",
        "week-of-year",
      ];

      describe("non-histogram units", () => {
        NON_HISTOGRAM_UNITS.forEach((unit) => {
          it(`should default ${unit} to false`, () => {
            const settings = getComputedSettingsForSeries(
              cardWithTimeseriesBreakout({ unit }),
            );
            expect(settings["graph.x_axis._is_histogram"]).toBe(false);
          });
        });
      });

      describe("histogram units", () => {
        HISTOGRAM_UNITS.forEach((unit) => {
          it(`should default ${unit} to true`, () => {
            const settings = getComputedSettingsForSeries(
              cardWithTimeseriesBreakout({ unit }),
            );
            expect(settings["graph.x_axis._is_histogram"]).toBe(true);
          });
        });
      });
    });

    describe("graph.y_axis.title_text", () => {
      const data = createMockDatasetData({
        cols: [
          DateTimeColumn({ unit: "month", name: "col1" }),
          NumberColumn({ name: "col2" }),
        ],
        rows: [[0, 0]],
      });

      it("should use the series title if set", () => {
        const card = createMockCard({
          visualization_settings: {
            "graph.y_axis.title_text": "some title",
          },
          display: "bar",
          name: "foo",
        });
        const settings = getComputedSettingsForSeries([{ card, data }]);
        expect(settings["graph.y_axis.title_text"]).toBe("some title");
      });

      it("should use the metric name if all series match", () => {
        const card = createMockCard({
          visualization_settings: {},
          display: "bar",
        });
        const settings = getComputedSettingsForSeries([
          { card, data },
          { card, data },
        ]);
        expect(settings["graph.y_axis.title_text"]).toBe("col2");
      });

      it("should be null if column names don't match", () => {
        const card = createMockCard({
          visualization_settings: {},
          display: "bar",
        });
        const data1 = createMockDatasetData({
          cols: [
            DateTimeColumn({ unit: "month", name: "col1" }),
            NumberColumn({ name: "col2a" }),
          ],
          rows: [[0, 0]],
        });
        const data2 = createMockDatasetData({
          cols: [
            DateTimeColumn({ unit: "month", name: "col1" }),
            NumberColumn({ name: "col2b" }),
          ],
          rows: [[0, 0]],
        });
        const settings = getComputedSettingsForSeries([
          { card, data: data1 },
          { card, data: data2 },
        ]);
        expect(settings["graph.y_axis.title_text"]).toBe(null);
      });
    });

    describe("graph.show_values", () => {
      it("should not show values on a bar chart by default", () => {
        const card = createMockCard({
          visualization_settings: {},
          display: "bar",
        });
        const data = createMockDatasetData({ rows: new Array(10).fill([1]) });
        const settings = getComputedSettingsForSeries([{ card, data }]);
        expect(settings["graph.show_values"]).toBe(false);
      });

      it("should not show values on a previously saved bar chart", () => {
        const card = createMockCard({
          visualization_settings: {},
          display: "bar",
          original_card_id: 1,
        });
        const data = createMockDatasetData({ rows: new Array(10).fill([1]) });
        const settings = getComputedSettingsForSeries([{ card, data }]);
        expect(settings["graph.show_values"]).toBe(false);
      });
    });
  });

  describe("getStoredSettingsForSeries", () => {
    it("should return an empty object if visualization_settings isn't defined", () => {
      const card = createMockCard({});
      const data = createMockDatasetData({ rows: [] });
      const settings = getStoredSettingsForSeries([{ card, data }]);
      expect(settings).toEqual({});
    });

    it("should pull out any saved visualization settings", () => {
      const card = createMockCard({ visualization_settings: { foo: "bar" } });
      const data = createMockDatasetData({ rows: [] });
      const settings = getStoredSettingsForSeries([{ card, data }]);
      expect(settings).toEqual({ foo: "bar" });
    });

    it("should work correctly with frozen objects", () => {
      const card = createMockCard({
        visualization_settings: {
          column_settings: {
            '["name","A"]': {
              number_style: "currency",
            },
          },
        },
      });
      const data = createMockDatasetData({ rows: [] });
      const settings = getStoredSettingsForSeries(
        icepick.freeze([{ card, data }]),
      );
      expect(settings).toEqual({
        column_settings: {
          '["name","A"]': {
            number_style: "currency",
          },
        },
      });
    });
  });

  describe("table.cell_column", () => {
    it("should pick the first metric column", () => {
      const settings = getComputedSettingsForSeries(
        cardWithTimeseriesBreakoutAndTwoMetrics({ display: "table" }),
      );
      expect(settings["table.cell_column"]).toBe("col2");
    });

    it("should not pick the pivot column", () => {
      const settings = getComputedSettingsForSeries(
        cardWithTimeseriesBreakoutAndTwoMetrics({
          display: "table",
          visualization_settings: { "table.pivot_column": "col2" },
        }),
      );
      expect(settings["table.cell_column"]).toBe("col3");
    });

    it("should pick a non-metric column if necessary", () => {
      const settings = getComputedSettingsForSeries(
        cardWithTimeseriesBreakout({
          display: "table",
          visualization_settings: { "table.pivot_column": "col2" },
        }),
      );
      expect(settings["table.cell_column"]).toBe("col1");
    });
  });

  describe("pie.rows memoization (metabase#50090) (metabase#50381)", () => {
    it("should memoize results when data hasn't changed", () => {
      const series = cardWithTimeseriesBreakout({
        unit: "month",
        display: "pie",
        visualization_settings: {
          "pie.dimension": ["col1"],
          "pie.metric": "col2",
        },
      });

      const originalSettings = getComputedSettingsForSeries(series);
      const unchangedSettings = getComputedSettingsForSeries(series);

      expect(originalSettings["pie.rows"]).toBe(unchangedSettings["pie.rows"]);

      // Series with different data
      const modifiedSeries = [
        {
          ...series[0],
          data: {
            ...series[0].data,
            rows: [[1, 1]],
          },
        },
      ];

      const modifiedSettings = getComputedSettingsForSeries(modifiedSeries);

      expect(originalSettings["pie.rows"]).not.toBe(
        modifiedSettings["pie.rows"],
      );
      expect(modifiedSettings["pie.rows"]).toEqual([
        {
          color: "#88BF4D",
          defaultColor: true,
          enabled: true,
          hidden: false,
          isOther: false,
          key: "1",
          name: "1",
          originalName: "1",
        },
      ]);
    });
  });

  describe("pie.metric and pie.dimension", () => {
    it("should pick defaults when there are multiple metric columns", () => {
      const series = [
        createMockSingleSeries(
          { display: "pie", visualization_settings: {} },
          {
            data: {
              cols: [
                StringColumn({ name: "category" }),
                NumberColumn({ name: "sum" }),
                NumberColumn({ name: "count" }),
              ],
              rows: [
                ["a", 10, 1],
                ["b", 20, 2],
              ],
            },
          },
        ),
      ];
      const settings = getComputedSettingsForSeries(series);
      expect(settings["pie.dimension"]).toEqual(["category"]);
      expect(settings["pie.metric"]).toBe("sum");
    });
  });

  describe("map.metric and map.dimension", () => {
    it("should pick defaults when there are multiple metric columns", () => {
      const series = [
        createMockSingleSeries(
          {
            display: "map",
            visualization_settings: { "map.type": "region" },
          },
          {
            data: {
              cols: [
                StringColumn({
                  name: "state",
                  semantic_type: "type/State",
                }),
                NumberColumn({ name: "count" }),
                NumberColumn({ name: "sum" }),
              ],
              rows: [["CA", 100, 100]],
            },
          },
        ),
      ];
      const settings = getComputedSettingsForSeries(series);
      expect(settings["map.metric"]).toBe("count");
    });
  });
});

const cardWithTimeseriesBreakout = ({
  unit,
  display = "bar",
  visualization_settings = {},
}: {
  unit?: string;
  display?: VisualizationDisplay;
  visualization_settings?: VisualizationSettings;
}): Series => [
  createMockSingleSeries(
    {
      display: display,
      visualization_settings,
    },
    {
      data: {
        cols: [
          DateTimeColumn({ unit, name: "col1" }),
          NumberColumn({ name: "col2" }),
        ],
        rows: [[0, 0]],
      },
    },
  ),
];

const cardWithTimeseriesBreakoutAndTwoMetrics = ({
  unit,
  display = "bar",
  visualization_settings = {},
}: {
  unit?: string;
  display?: VisualizationDisplay;
  visualization_settings?: VisualizationSettings;
}): Series => [
  createMockSingleSeries(
    {
      display: display,
      visualization_settings,
    },
    {
      data: {
        cols: [
          DateTimeColumn({ unit, name: "col1" }),
          NumberColumn({ name: "col2" }),
          NumberColumn({ name: "col3" }),
        ],
        rows: [[0, 0, 0]],
      },
    },
  ),
];
