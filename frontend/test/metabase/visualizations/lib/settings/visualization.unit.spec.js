// NOTE: need to load visualizations first for getSettings to work
import "metabase/visualizations/index";

import {
  getComputedSettingsForSeries,
  getStoredSettingsForSeries,
} from "metabase/visualizations/lib/settings/visualization";

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
    it("should normalize stored columnSettings keys", () => {
      const oldKey = `["ref",["fk->",1,2]]`;
      const newKey = `["ref",["fk->",["field-id",1],["field-id",2]]]`;
      const settings = getStoredSettingsForSeries([
        {
          card: {
            visualization_settings: { column_settings: { [oldKey]: "blah" } },
          },
        },
      ]);
      expect(settings.column_settings).toEqual({ [newKey]: "blah" });
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
