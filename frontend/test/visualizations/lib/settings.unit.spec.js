// NOTE: need to load visualizations first for getSettings to work
import "metabase/visualizations/index";

import { getSettings } from "metabase/visualizations/lib/settings";

import { DateTimeColumn, NumberColumn } from "../__support__/visualizations";

describe("visualization_settings", () => {
  describe("getSettings", () => {
    describe("stackable.stack_type", () => {
      it("should default to unstacked stacked", () => {
        const settings = getSettings(
          cardWithTimeseriesBreakout({ unit: "month" }),
        );
        expect(settings["stackable.stack_type"]).toBe(null);
      });
      it("should default area chart to stacked for 1 dimensions and 2 metrics", () => {
        const settings = getSettings(
          cardWithTimeseriesBreakoutAndTwoMetrics({
            display: "area",
            unit: "month",
          }),
        );
        expect(settings["stackable.stack_type"]).toBe("stacked");
      });
    });
    describe("graph.x_axis._is_histogram", () => {
      const HISTOGRAM_UNITS = [
        "minute-of-hour",
        "hour-of-day",
        "day-of-month",
        "day-of-year",
        "week-of-year",
      ];
      const NON_HISTOGRAM_UNITS = [
        "day-of-week",
        "month-of-year",
        "quarter-of-year",
      ];
      describe("non-histgram units", () =>
        NON_HISTOGRAM_UNITS.map(unit =>
          it(`should default ${unit} to false`, () => {
            const settings = getSettings(cardWithTimeseriesBreakout({ unit }));
            expect(settings["graph.x_axis._is_histogram"]).toBe(false);
          }),
        ));
      describe("histgram units", () =>
        HISTOGRAM_UNITS.map(unit =>
          it(`should default ${unit} to true`, () => {
            const settings = getSettings(cardWithTimeseriesBreakout({ unit }));
            expect(settings["graph.x_axis._is_histogram"]).toBe(true);
          }),
        ));
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
