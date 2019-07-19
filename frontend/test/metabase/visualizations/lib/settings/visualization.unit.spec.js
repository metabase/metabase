// NOTE: need to load visualizations first for getSettings to work
import "metabase/visualizations/index";

import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";

import { DateTimeColumn, NumberColumn } from "../../__support__/visualizations";

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
      describe("non-histgram units", () =>
        NON_HISTOGRAM_UNITS.map(unit =>
          it(`should default ${unit} to false`, () => {
            const settings = getComputedSettingsForSeries(
              cardWithTimeseriesBreakout({ unit }),
            );
            expect(settings["graph.x_axis._is_histogram"]).toBe(false);
          }),
        ));
      describe("histgram units", () =>
        HISTOGRAM_UNITS.map(unit =>
          it(`should default ${unit} to true`, () => {
            const settings = getComputedSettingsForSeries(
              cardWithTimeseriesBreakout({ unit }),
            );
            expect(settings["graph.x_axis._is_histogram"]).toBe(true);
          }),
        ));
    });
    describe("table.columns", () => {
      it("should populate an empty table.columns based on data columns", () => {
        const cols = ["foo", "bar", "baz"].map(name => NumberColumn({ name }));
        const card = { display: "table", visualization_settings: {} };
        const settings = getComputedSettingsForSeries([
          { card, data: { cols } },
        ]);
        expect(settings["table.columns"].map(c => c.name)).toEqual([
          "foo",
          "bar",
          "baz",
        ]);
      });
      it("should add to table.columns based on new data columns", () => {
        const cols = ["foo", "bar", "baz"].map(name => NumberColumn({ name }));
        const card = {
          display: "table",
          visualization_settings: {
            "table.columns": [{ name: "foo" }, { name: "bar" }],
          },
        };
        const settings = getComputedSettingsForSeries([
          { card, data: { cols } },
        ]);
        expect(settings["table.columns"].map(c => c.name)).toEqual([
          "foo",
          "bar",
          "baz",
        ]);
      });
      it("should remove from table.columns if not present in the data's columns", () => {
        const cols = ["bar", "baz"].map(name => NumberColumn({ name }));
        const card = {
          display: "table",
          visualization_settings: {
            "table.columns": [{ name: "foo" }, { name: "bar" }],
          },
        };
        const settings = getComputedSettingsForSeries([
          { card, data: { cols } },
        ]);
        expect(settings["table.columns"].map(c => c.name)).toEqual([
          "bar",
          "baz",
        ]);
      });
    });
  });
});

const cardWithTimeseriesBreakout = ({ unit, display = "bar" }) => [
  {
    card: {
      display: display,
      visualization_settings: {},
    },
    data: {
      cols: [DateTimeColumn({ unit }), NumberColumn()],
      rows: [[0, 0]],
    },
  },
];

const cardWithTimeseriesBreakoutAndTwoMetrics = ({ unit, display = "bar" }) => [
  {
    card: {
      display: display,
      visualization_settings: {},
    },
    data: {
      cols: [DateTimeColumn({ unit }), NumberColumn(), NumberColumn()],
      rows: [[0, 0, 0]],
    },
  },
];
