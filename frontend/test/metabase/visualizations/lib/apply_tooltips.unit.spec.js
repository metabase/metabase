import moment from "moment-timezone";

import { getClickHoverObject } from "metabase/visualizations/lib/apply_tooltips";
import { getDatas } from "metabase/visualizations/lib/renderer_utils";

import {
  getFormattedTooltips,
  BooleanColumn,
  DateTimeColumn,
  StringColumn,
  NumberColumn,
} from "../__support__/visualizations";

describe("getClickHoverObject", () => {
  it("should return data for tooltip", () => {
    const d = { data: { key: "foobar", value: 123 } };
    const cols = [StringColumn(), NumberColumn()];
    const rows = [["foobar", 123]];
    const otherArgs = {
      ...seriesAndData({ cols, rows }),
      seriesIndex: 0,
      classList: [],
      event: {},
    };

    const obj = getClickHoverObject(d, otherArgs);

    expect(getFormattedTooltips(obj)).toEqual(["foobar", "123"]);
  });

  it("should show the correct tooltip for dates", () => {
    const d = {
      data: {
        key: moment("2016-04-01T00:00:00.000Z", "YYYY-MM-DDTHH:mm:ss.SSSSZ"),
        value: 123,
      },
    };
    const cols = [DateTimeColumn({ unit: "month" }), NumberColumn()];
    const rows = [
      ["2016-03-01T00:00:00.000Z", 1],
      ["2016-04-01T00:00:00.000Z", 2],
      ["2016-05-01T00:00:00.000Z", 3],
    ];
    const otherArgs = {
      ...seriesAndData({ cols, rows }),
      seriesIndex: 0,
      classList: [],
      event: {},
    };

    const obj = getClickHoverObject(d, otherArgs);

    expect(getFormattedTooltips(obj)).toEqual(["April, 2016", "2"]);
  });

  it("should show the correct tooltip for months", () => {
    const d = {
      data: {
        key: moment("2016-04-01T00:00:00.000Z", "YYYY-MM-DDTHH:mm:ss.SSSSZ"),
        value: 123,
      },
    };
    const cols = [DateTimeColumn({ unit: "month" }), NumberColumn()];
    const rows = [
      ["2016-03", 1],
      ["2016-04", 2],
      ["2016-05", 3],
    ];
    const otherArgs = {
      ...seriesAndData({ cols, rows }),
      seriesIndex: 0,
      classList: [],
      event: {},
    };

    const obj = getClickHoverObject(d, otherArgs);

    expect(getFormattedTooltips(obj)).toEqual(["April, 2016", "2"]);
  });

  describe("event/element target", () => {
    const d = { data: { key: "foobar", value: 123 } };
    const cols = [StringColumn(), NumberColumn()];
    const rows = [["foobar", 123]];
    const otherArgs = {
      ...seriesAndData({ cols, rows }),
      seriesIndex: 0,
      element: "DOM element",
    };

    describe("with mouse location", () => {
      [
        ["click", "bar"],
        ["mousemove", "area"],
        ["click", "area"],
      ].forEach(testCase => {
        const [eventType, cssClass] = testCase;

        it(`should return correct target for "${eventType}" event with "${cssClass}" class`, () => {
          const { event, element } = getClickHoverObject(d, {
            ...otherArgs,
            classList: [cssClass],
            event: { type: eventType },
          });
          expect(event).toEqual({ type: eventType });
          expect(element).toEqual(null);
        });
      });
    });

    describe("without mouse location", () => {
      [
        ["mousemove", "bar"],
        ["mousemove", "dot"],
        ["click", "dot"],
      ].forEach(testCase => {
        const [eventType, cssClass] = testCase;
        it(`should return correct target for "${eventType}" event with "${cssClass}" class`, () => {
          const { event, element } = getClickHoverObject(d, {
            ...otherArgs,
            classList: [cssClass],
            event: { type: eventType },
          });
          expect(event).toEqual(null);
          expect(element).toEqual("DOM element");
        });
      });
    });
  });

  it("should exclude aggregation and query-transform columns from dimensions", () => {
    const d = { data: { key: "foobar", value: 123 } };
    const cols = [
      StringColumn(),
      NumberColumn({ source: "aggregation" }),
      StringColumn({ source: "query-transform" }),
    ];
    const rows = [["foobar", 123, "barfoo"]];
    const otherArgs = {
      ...seriesAndData({ cols, rows }),
      seriesIndex: 0,
      classList: [],
      event: {},
    };

    const { data, dimensions } = getClickHoverObject(d, otherArgs);

    expect(data.map(d => d.col)).toEqual(cols);
    expect(dimensions.map(d => d.column)).toEqual([cols[0]]);
  });

  it("should parse boolean strings in boolean columns", () => {
    const d = { data: { key: "foobar", value: "true" } };
    const cols = [StringColumn(), BooleanColumn()];
    const rows = [["foobar", "true"]];
    const otherArgs = {
      ...seriesAndData({ cols, rows }),
      seriesIndex: 0,
      classList: [],
      event: {},
      seriesTitle: "better name",
    };

    const {
      dimensions: [, { value: dimValue }],
      value: dValue,
    } = getClickHoverObject(d, otherArgs);

    expect(dimValue).toBe(true);
    expect(dValue).toBe(true);
  });

  it("should show correct tooltip for nulls", () => {
    const d = { data: { key: "(empty)", value: "true" } };
    const cols = [StringColumn(), NumberColumn()];
    const rows = [
      ["foobar", 1],
      [null, 2],
      ["barfoo", 3],
    ];
    const otherArgs = {
      ...seriesAndData({
        cols,
        rows,
        settings: {
          "graph.x_axis.scale": "ordinal",
        },
      }),
      seriesIndex: 0,
      classList: [],
      event: {},
    };

    const obj = getClickHoverObject(d, otherArgs);
    expect(getFormattedTooltips(obj)).toEqual(["(empty)", "2"]);
  });
});

function seriesAndData({ cols, rows, settings = {} }) {
  const series = [{ data: { cols, rows }, card: {} }];
  const datas = getDatas({ series, settings });
  return { series, datas };
}
