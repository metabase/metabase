import moment from "moment-timezone";

import {
  getClickObject,
  getTooltipModel,
} from "metabase/visualizations/lib/apply_tooltips";
import { getDatas } from "metabase/visualizations/lib/renderer_utils";

import {
  getFormattedTooltips,
  BooleanColumn,
  DateTimeColumn,
  StringColumn,
  NumberColumn,
} from "../__support__/visualizations";

describe("getClickObject", () => {
  it("should return data for tooltip", () => {
    const d = { data: { key: "foobar", value: 123 } };
    const cols = [StringColumn(), NumberColumn()];
    const rows = [["foobar", 123]];
    const otherArgs = {
      ...seriesAndData({ cols, rows }),
      seriesIndex: 0,
      classList: [],
    };

    const obj = getClickObject(d, otherArgs);

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
    };

    const obj = getClickObject(d, otherArgs);

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
    };

    const obj = getClickObject(d, otherArgs);

    expect(getFormattedTooltips(obj)).toEqual(["April, 2016", "2"]);
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
    };

    const { data, dimensions } = getClickObject(d, otherArgs);

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
      seriesTitle: "better name",
    };

    const {
      dimensions: [, { value: dimValue }],
      value: dValue,
    } = getClickObject(d, otherArgs);

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
    };

    const obj = getClickObject(d, otherArgs);
    expect(getFormattedTooltips(obj)).toEqual(["(empty)", "2"]);
  });
});

describe("getTooltipModel", () => {
  const settings = {
    "series_settings.colors": {
      "Series 1": "red",
      "Series 2": "green",
    },
    series: () => null,
  };
  const cols = [StringColumn(), NumberColumn()];
  const getMockSeries = hasBreakout => [
    {
      data: {
        cols,
        rows: [["foo", 100]],
        settings: {},
        _breakoutColumn: hasBreakout ? StringColumn() : undefined,
      },
      card: {
        name: "Series 1",
        _breakoutColumn: hasBreakout ? StringColumn() : undefined,
      },
    },
    {
      data: {
        cols,
        rows: [["foo", 200]],
        settings: {},
      },
      card: { name: "Series 2" },
    },
  ];

  const hoveredIndex = 0;
  const xValue = "foo";

  it("sets tooltip model rows", () => {
    const series = getMockSeries();
    const datas = getDatas({ series, settings });
    const { bodyRows, headerRows, headerTitle } = getTooltipModel(
      xValue,
      series,
      hoveredIndex,
      datas,
      settings,
    );

    expect(headerTitle).toBe("foo");
    expect(headerRows).toHaveLength(1);
    expect(headerRows[0]).toEqual(
      expect.objectContaining({
        color: "red",
        name: "Series 1",
        value: 100,
      }),
    );
    expect(bodyRows).toHaveLength(1);
    expect(bodyRows[0]).toEqual(
      expect.objectContaining({
        color: "green",
        name: "Series 2",
        value: 200,
      }),
    );
  });

  it("sets showTotal and showPercentages to true for charts with breakouts", () => {
    const series = getMockSeries(true);
    const datas = getDatas({ series, settings });
    const { showTotal, showPercentages } = getTooltipModel(
      xValue,
      series,
      hoveredIndex,
      datas,
      settings,
    );

    expect(showTotal).toBe(true);
    expect(showPercentages).toBe(true);
  });

  it("sets showTotal and showPercentages to false for charts without breakouts", () => {
    const series = getMockSeries();
    const datas = getDatas({ series, settings });
    const { showTotal, showPercentages } = getTooltipModel(
      xValue,
      series,
      hoveredIndex,
      datas,
      settings,
    );

    expect(showTotal).toBe(false);
    expect(showPercentages).toBe(false);
  });
});

function seriesAndData({ cols, rows, settings = {} }) {
  const series = [{ data: { cols, rows }, card: {} }];
  const datas = getDatas({ series, settings });
  return { series, datas };
}
