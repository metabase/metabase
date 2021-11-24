import moment from "moment";

import {
  getDatas,
  getXValues,
  parseXValue,
  syntheticStackedBarsForWaterfallChart,
} from "metabase/visualizations/lib/renderer_utils";

describe("getXValues", () => {
  function getXValuesForRows(listOfRows, settings = {}) {
    const series = listOfRows.map(rows => ({ data: { rows, cols: [{}] } }));
    series._raw = series;
    return getXValues({ settings, series });
  }

  it("should not change the order of a single series of ascending numbers", () => {
    expect(getXValuesForRows([[[1], [2], [11]]])).toEqual([1, 2, 11]);
  });
  it("should not change the order of a single series of descending numbers", () => {
    expect(getXValuesForRows([[[11], [2], [1]]])).toEqual([11, 2, 1]);
  });
  it("should not change the order of a single series of non-ordered numbers", () => {
    expect(getXValuesForRows([[[2], [1], [11]]])).toEqual([2, 1, 11]);
  });

  it("should not change the order of a single series of ascending strings", () => {
    expect(getXValuesForRows([[["1"], ["2"], ["11"]]])).toEqual([
      "1",
      "2",
      "11",
    ]);
  });
  it("should not change the order of a single series of descending strings", () => {
    expect(getXValuesForRows([[["1"], ["2"], ["11"]]])).toEqual([
      "1",
      "2",
      "11",
    ]);
  });
  it("should not change the order of a single series of non-ordered strings", () => {
    expect(getXValuesForRows([[["2"], ["1"], ["11"]]])).toEqual([
      "2",
      "1",
      "11",
    ]);
  });

  it("should correctly merge multiple series of ascending numbers", () => {
    expect(
      getXValuesForRows([
        [[2], [11], [12]],
        [[1], [2], [11]],
      ]),
    ).toEqual([1, 2, 11, 12]);
  });
  it("should correctly merge multiple series of descending numbers", () => {
    expect(
      getXValuesForRows([
        [[12], [11], [2]],
        [[11], [2], [1]],
      ]),
    ).toEqual([12, 11, 2, 1]);
  });
  it("should use raw row ordering rather than broken out series", () => {
    const series = [
      // these are broken out series. the ordering here is ignored
      { data: { rows: [["a"], ["b"]], cols: [{}] } },
      { data: { rows: [["c"], ["d"]], cols: [{}] } },
    ];
    series._raw = [
      { data: { rows: [["d"], ["c"], ["b"], ["a"]], cols: [{}] } },
    ];
    const settings = {};
    expect(getXValues({ settings, series })).toEqual(["d", "c", "b", "a"]);
  });
  it("should use the correct column as the dimension for raw series", () => {
    const series = [
      {
        data: {
          rows: [["second", "first"]],
          cols: [{ name: "second" }, { name: "first" }],
        },
      },
    ];
    series._raw = [
      {
        data: {
          rows: [["first", "second"]],
          cols: [{ name: "first" }, { name: "second" }],
        },
      },
    ];
    const settings = { "graph.dimensions": ["second"] };
    expect(getXValues({ settings, series })).toEqual(["second"]);
  });
  it("should use the correct column as the dimension for parsing options", () => {
    const series = [
      {
        data: {
          rows: [["foo", "2019-09-01T00:00:00Z"]],
          cols: [
            { name: "other" },
            { name: "date", base_type: "type/DateTime" },
          ],
        },
      },
    ];
    series._raw = series;
    const settings = { "graph.dimensions": ["date"] };
    const [xVal] = getXValues({ settings, series });
    expect(moment.isMoment(xVal)).toBe(true);
  });
  it("should sort values according to parsed value", () => {
    expect(
      getXValuesForRows(
        [
          [["2019-W33"], ["2019-08-13"]],
          [["2019-08-11"], ["2019-W33"]],
        ],
        { "graph.x_axis.scale": "timeseries" },
      ).map(x => x.format()),
    ).toEqual([
      "2019-08-11T00:00:00Z",
      "2019-08-12T00:00:00Z",
      "2019-08-13T00:00:00Z",
    ]);
  });
  it("should include nulls for ordinal", () => {
    const settings = { "graph.x_axis.scale": "ordinal" };
    const xValues = getXValuesForRows([[["foo"], [null], ["bar"]]], settings);
    expect(xValues).toEqual(["foo", "(empty)", "bar"]);
  });
  it("should exclude nulls for histograms", () => {
    const xValues = getXValuesForRows([[["foo"], [null], ["bar"]]], {
      "graph.x_axis.scale": "histogram",
    });
    expect(xValues).toEqual(["foo", "bar"]);
  });
  it("should exclude nulls for timeseries", () => {
    const xValues = getXValuesForRows(
      [[["2019-01-02"], [null], ["2019-01-03"]]],
      {
        "graph.x_axis.scale": "timeseries",
      },
    );
    const formattedXValues = xValues.map(v => v.format("YYYY-MM-DD"));
    expect(formattedXValues).toEqual(["2019-01-02", "2019-01-03"]);
  });
});

describe("parseXValue", () => {
  it("should use options as part of the cache key", () => {
    const value1 = parseXValue("2018-08-23", { isTimeseries: true });
    const value2 = parseXValue("2018-08-23", { isTimeseries: false });
    expect(moment.isMoment(value1)).toBe(true);
    expect(moment.isMoment(value2)).toBe(false);
  });

  it("should warn repeatedly (despite caching)", () => {
    const warn = jest.fn();
    parseXValue("2018-W60", { isTimeseries: true }, warn);
    parseXValue("2018-W60", { isTimeseries: true }, warn);
    expect(warn.mock.calls.length).toBe(2);
  });
});

describe("getDatas", () => {
  it("should include rows with a null dimension for ordinal axis", () => {
    const settings = { "graph.x_axis.scale": "ordinal" };
    const series = [{ data: { rows: [["foo"], [null], ["bar"]], cols: [{}] } }];
    const warn = jest.fn();
    const xValues = getDatas({ settings, series }, warn);
    expect(xValues).toEqual([[["foo"], ["(empty)"], ["bar"]]]);
  });
  it("should exclude rows with null dimension for histograms", () => {
    const settings = { "graph.x_axis.scale": "histogram" };
    const series = [{ data: { rows: [["foo"], [null], ["bar"]], cols: [{}] } }];
    const warn = jest.fn();
    const xValues = getDatas({ settings, series }, warn);
    expect(xValues).toEqual([[["foo"], ["bar"]]]);
    expect(warn.mock.calls.length).toBe(1);
    const [{ key: warningKey }] = warn.mock.calls[0];
    expect(warningKey).toBe("NULL_DIMENSION_WARNING");
  });

  it("should not parse timeseries-like data if the scale isn't timeseries", () => {
    const settings = { "graph.x_axis.scale": "ordinal" };
    const series = [{ data: { rows: [["2019-01-01"]], cols: [{}] } }];
    const warn = () => {};
    const xValues = getDatas({ settings, series }, warn);
    expect(xValues).toEqual([[["2019-01-01"]]]);
  });

  it("should parse timeseries-like data if the scale is timeseries", () => {
    const settings = { "graph.x_axis.scale": "timeseries" };
    const series = [{ data: { rows: [["2019-01-01"]], cols: [{}] } }];
    const warn = () => {};
    const [[[m]]] = getDatas({ settings, series }, warn);
    expect(moment.isMoment(m)).toBe(true);
  });

  it("should parse timeseries-like data if column is timeseries", () => {
    const settings = { "graph.x_axis.scale": "ordinal" };
    const series = [
      {
        data: {
          rows: [["2019-01-01"]],
          cols: [{ base_type: "type/DateTime" }],
        },
      },
    ];
    const warn = () => {};
    const [[[m]]] = getDatas({ settings, series }, warn);
    expect(moment.isMoment(m)).toBe(true);
  });
});

describe("syntheticStackedBarsForWaterfallChart", () => {
  const cols = [
    {
      name: "PRODUCT",
      base_type: "type/Text",
    },
    {
      name: "PROFIT",
      base_type: "type/Integer",
    },
  ];

  function prepareDatas(...rows) {
    const data = rows.map((row, rowIndex) => {
      const seriesIndex = 0;
      const point = row.slice();
      point._origin = { cols, row, rowIndex, seriesIndex };
      return point;
    });
    return Array.of(data);
  }

  it("should create the stacked bars for 1 row", () => {
    const datas = prepareDatas(["Apples", 10]);
    const settings = {
      "waterfall.show_total": true,
    };
    const stackedBarsDatas = syntheticStackedBarsForWaterfallChart(
      datas,
      settings,
    );
    expect(typeof stackedBarsDatas.length).toEqual("number");
    expect(stackedBarsDatas.length).toEqual(4);
    const [beams, negatives, positives, total] = stackedBarsDatas.map(stacked =>
      stacked.map(e => e[1]),
    );
    expect(beams).toEqual([0, 0]);
    expect(negatives).toEqual([0, 0]);
    expect(positives).toEqual([10, 0]);
    expect(total).toEqual([0, 10]);
  });

  it("should create the stacked bars for 2 rows", () => {
    const datas = prepareDatas(["Apples", 10], ["Bananas", 4]);
    const settings = {
      "waterfall.show_total": true,
    };
    const stackedBarsDatas = syntheticStackedBarsForWaterfallChart(
      datas,
      settings,
    );
    expect(typeof stackedBarsDatas.length).toEqual("number");
    expect(stackedBarsDatas.length).toEqual(4);
    const [beams, negatives, positives, total] = stackedBarsDatas.map(stacked =>
      stacked.map(e => e[1]),
    );
    expect(beams).toEqual([0, 10, 0]);
    expect(negatives).toEqual([0, 0, 0]);
    expect(positives).toEqual([10, 4, 0]);
    expect(total).toEqual([0, 0, 14]);
  });

  it("should create the stacked bars for 3 rows", () => {
    const datas = prepareDatas(["Apples", 10], ["Bananas", 4], ["Oranges", 5]);
    const settings = {
      "waterfall.show_total": true,
    };
    const stackedBarsDatas = syntheticStackedBarsForWaterfallChart(
      datas,
      settings,
    );
    expect(typeof stackedBarsDatas.length).toEqual("number");
    expect(stackedBarsDatas.length).toEqual(4);
    const [beams, negatives, positives, total] = stackedBarsDatas.map(stacked =>
      stacked.map(e => e[1]),
    );
    expect(beams).toEqual([0, 10, 14, 0]);
    expect(negatives).toEqual([0, 0, 0, 0]);
    expect(positives).toEqual([10, 4, 5, 0]);
    expect(total).toEqual([0, 0, 0, 19]);
  });

  it("should work with all-negative values", () => {
    const datas = prepareDatas(["X", -14], ["Y", -3], ["Z", -10]);
    const settings = {
      "waterfall.show_total": true,
    };
    const stackedBarsDatas = syntheticStackedBarsForWaterfallChart(
      datas,
      settings,
    );
    expect(typeof stackedBarsDatas.length).toEqual("number");
    expect(stackedBarsDatas.length).toEqual(4);
    const [beams, negatives, positives, total] = stackedBarsDatas.map(stacked =>
      stacked.map(e => e[1]),
    );
    expect(beams).toEqual([0, -14, -17, 0]);
    expect(negatives).toEqual([-14, -3, -10, 0]);
    expect(positives).toEqual([0, 0, 0, 0]);
    expect(total).toEqual([0, 0, 0, -27]);
  });

  it("should work with mixed (positives & negatives) values", () => {
    const datas = prepareDatas(["P", -2], ["Q", 24], ["R", -5]);
    const settings = {
      "waterfall.show_total": true,
    };
    const stackedBarsDatas = syntheticStackedBarsForWaterfallChart(
      datas,
      settings,
    );
    expect(typeof stackedBarsDatas.length).toEqual("number");
    expect(stackedBarsDatas.length).toEqual(4);
    const [beams, negatives, positives, total] = stackedBarsDatas.map(stacked =>
      stacked.map(e => e[1]),
    );
    expect(beams).toEqual([0, -2, 22, 0]);
    expect(negatives).toEqual([-2, 0, -5, 0]);
    expect(positives).toEqual([0, 24, 0, 0]);
    expect(total).toEqual([0, 0, 0, 17]);
  });

  it("should work even when the total bar is not meant to shown", () => {
    const datas = prepareDatas(["A", 3], ["B", 5], ["C", 7]);
    const settings = {
      "waterfall.show_total": false,
    };
    const stackedBarsDatas = syntheticStackedBarsForWaterfallChart(
      datas,
      settings,
    );
    expect(typeof stackedBarsDatas.length).toEqual("number");
    expect(stackedBarsDatas.length).toEqual(4);
    const [beams, negatives, positives, total] = stackedBarsDatas.map(stacked =>
      stacked.map(e => e[1]),
    );
    expect(beams).toEqual([0, 3, 8]);
    expect(negatives).toEqual([0, 0, 0]);
    expect(positives).toEqual([3, 5, 7]);
    expect(total).toEqual([0, 0, 0]);
  });
});
