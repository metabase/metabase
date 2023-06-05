import icepick from "icepick";
// NOTE: need to load visualizations first for getSettings to work
import "metabase/visualizations/index";

import {
  getComputedSettingsForSeries,
  getStoredSettingsForSeries,
} from "metabase/visualizations/lib/settings/visualization";

import { DateTimeColumn, NumberColumn } from "__support__/visualizations";

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
      const HISTOGRAM_UNITS = [];
      const NON_HISTOGRAM_UNITS = [
        // definitely not histogram
        "day-of-week",
        "month-of-year",
        "quarter-of-year",
        // arguably histogram but diabled for now
        "minute-of-hour",
        "hour-of-day",
        "day-of-month",
        "day-of-year",
        "week-of-year",
      ];
      describe("non-histgram units", () => {
        NON_HISTOGRAM_UNITS.forEach(unit => {
          it(`should default ${unit} to false`, () => {
            const settings = getComputedSettingsForSeries(
              cardWithTimeseriesBreakout({ unit }),
            );
            expect(settings["graph.x_axis._is_histogram"]).toBe(false);
          });
        });
      });
      describe("histgram units", () => {
        HISTOGRAM_UNITS.forEach(unit => {
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
      const data = {
        cols: [
          DateTimeColumn({ unit: "month", name: "col1" }),
          NumberColumn({ name: "col2" }),
        ],
        rows: [[0, 0]],
      };

      it("should use the series title if set", () => {
        const card = {
          visualization_settings: {
            "graph.y_axis.title_text": "some title",
          },
          display: "bar",
          name: "foo",
        };
        const settings = getComputedSettingsForSeries([{ card, data }]);
        expect(settings["graph.y_axis.title_text"]).toBe("some title");
      });

      it("should use the metric name if all series match", () => {
        const card = { visualization_settings: {}, display: "bar" };
        const settings = getComputedSettingsForSeries([
          { card, data },
          { card, data },
        ]);
        expect(settings["graph.y_axis.title_text"]).toBe("col2");
      });

      it("should be null if column names don't match", () => {
        const card = { visualization_settings: {}, display: "bar" };
        const data1 = {
          cols: [
            DateTimeColumn({ unit: "month", name: "col1" }),
            NumberColumn({ name: "col2a" }),
          ],
          rows: [[0, 0]],
        };
        const data2 = {
          cols: [
            DateTimeColumn({ unit: "month", name: "col1" }),
            NumberColumn({ name: "col2b" }),
          ],
          rows: [[0, 0]],
        };
        const settings = getComputedSettingsForSeries([
          { card, data: data1 },
          { card, data: data2 },
        ]);
        expect(settings["graph.y_axis.title_text"]).toBe(null);
      });
    });

    describe("graph.show_values", () => {
      it("should not show values on a bar chart by default", () => {
        const card = { visualization_settings: {}, display: "bar" };
        const data = { rows: new Array(10).fill([1]) };
        const settings = getComputedSettingsForSeries([{ card, data }]);
        expect(settings["graph.show_values"]).toBe(false);
      });
      it("should not show values on a previously saved bar chart", () => {
        const card = {
          visualization_settings: {},
          display: "bar",
          original_card_id: 1,
        };
        const data = { rows: new Array(10).fill([1]) };
        const settings = getComputedSettingsForSeries([{ card, data }]);
        expect(settings["graph.show_values"]).toBe(false);
      });
    });
    describe("table.columns", () => {
      it("should include fieldRef in default table.columns", () => {
        const card = { visualization_settings: {} };
        const cols = [
          NumberColumn({
            name: "some number",
            field_ref: ["field", 123, null],
          }),
        ];
        const {
          "table.columns": [setting],
        } = getComputedSettingsForSeries([{ card, data: { cols } }]);

        expect(setting.fieldRef).toEqual(["field", 123, null]);
      });
    });
  });

  describe("getStoredSettingsForSeries", () => {
    it("should return an empty object if visualization_settings isn't defined", () => {
      const settings = getStoredSettingsForSeries([{ card: {} }]);
      expect(settings).toEqual({});
    });
    it("should pull out any saved visualization settings", () => {
      const settings = getStoredSettingsForSeries([
        { card: { visualization_settings: { foo: "bar" } } },
      ]);
      expect(settings).toEqual({ foo: "bar" });
    });
    it("should work correctly with frozen objects", () => {
      const settings = getStoredSettingsForSeries(
        icepick.freeze([
          {
            card: {
              visualization_settings: {
                column_settings: {
                  '["name","A"]': {
                    number_style: "currency",
                  },
                },
              },
            },
          },
        ]),
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
});

const cardWithTimeseriesBreakout = ({
  unit,
  display = "bar",
  visualization_settings = {},
}) => [
  {
    card: {
      display: display,
      visualization_settings,
    },
    data: {
      cols: [
        DateTimeColumn({ unit, name: "col1" }),
        NumberColumn({ name: "col2" }),
      ],
      rows: [[0, 0]],
    },
  },
];

const cardWithTimeseriesBreakoutAndTwoMetrics = ({
  unit,
  display = "bar",
  visualization_settings = {},
}) => [
  {
    card: {
      display: display,
      visualization_settings,
    },
    data: {
      cols: [
        DateTimeColumn({ unit, name: "col1" }),
        NumberColumn({ name: "col2" }),
        NumberColumn({ name: "col3" }),
      ],
      rows: [[0, 0, 0]],
    },
  },
];
