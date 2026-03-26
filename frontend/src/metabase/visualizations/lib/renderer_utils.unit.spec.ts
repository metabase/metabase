import dayjs, { type Dayjs } from "dayjs";

import {
  getXValues,
  parseXValue,
} from "metabase/visualizations/lib/renderer_utils";
import type {
  RowValues,
  Series,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import { isObject } from "metabase-types/guards";

describe("getXValues", () => {
  function getXValuesForRows(
    listOfRows: RowValues[][],
    settings: VisualizationSettings = {},
  ) {
    const series: Series = listOfRows.map((rows) => ({
      card: createMockCard(),
      data: createMockDatasetData({ rows, cols: [createMockColumn()] }),
    }));
    Object.assign(series, { _raw: series });
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
    const series: Series = [
      // these are broken out series. the ordering here is ignored
      {
        card: createMockCard(),
        data: createMockDatasetData({
          rows: [["a"], ["b"]],
          cols: [createMockColumn()],
        }),
      },
      {
        card: createMockCard(),
        data: createMockDatasetData({
          rows: [["c"], ["d"]],
          cols: [createMockColumn()],
        }),
      },
    ];
    Object.assign(series, {
      _raw: [
        {
          data: {
            rows: [["d"], ["c"], ["b"], ["a"]],
            cols: [createMockColumn()],
          },
        },
      ],
    });
    const settings = {};
    expect(getXValues({ settings, series })).toEqual(["d", "c", "b", "a"]);
  });

  it("should return empty array when data has no rows and columns", () => {
    const series: Series = [
      {
        card: createMockCard(),
        data: createMockDatasetData({ rows: [], cols: [] }),
      },
    ];
    Object.assign(series, { _raw: [{ data: { rows: [], cols: [] } }] });

    expect(getXValues({ settings: {}, series })).toEqual([]);
  });

  it("should use the correct column as the dimension for raw series", () => {
    const series: Series = [
      {
        card: createMockCard(),
        data: createMockDatasetData({
          rows: [["second", "first"]],
          cols: [
            createMockColumn({ name: "second" }),
            createMockColumn({ name: "first" }),
          ],
        }),
      },
    ];
    Object.assign(series, {
      _raw: [
        {
          data: {
            rows: [["first", "second"]],
            cols: [{ name: "first" }, { name: "second" }],
          },
        },
      ],
    });
    const settings = { "graph.dimensions": ["second"] };
    expect(getXValues({ settings, series })).toEqual(["second"]);
  });

  it("should use the correct column as the dimension for parsing options", () => {
    const series: Series = [
      {
        card: createMockCard(),
        data: createMockDatasetData({
          rows: [["foo", "2019-09-01T00:00:00Z"]],
          cols: [
            createMockColumn({ name: "other" }),
            createMockColumn({ name: "date", base_type: "type/DateTime" }),
          ],
        }),
      },
    ];
    Object.assign(series, { _raw: series });
    const settings = { "graph.dimensions": ["date"] };
    const [xVal] = getXValues({ settings, series });
    expect(dayjs.isDayjs(xVal)).toBe(true);
  });

  it("should sort values according to parsed value", () => {
    expect(
      getXValuesForRows(
        [
          [["2019-W33"], ["2019-08-13"]],
          [["2019-08-11"], ["2019-W33"]],
        ],
        { "graph.x_axis.scale": "timeseries" },
      )
        .filter((value): value is Dayjs => isObject(value) && "format" in value)
        .map((value) => value.format()),
    ).toEqual([
      "2019-08-11T00:00:00Z",
      "2019-08-12T00:00:00Z",
      "2019-08-13T00:00:00Z",
    ]);
  });

  it("should include nulls for ordinal", () => {
    const settings: VisualizationSettings = { "graph.x_axis.scale": "ordinal" };
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
    const formattedXValues = xValues
      .filter((value): value is Dayjs => isObject(value) && "format" in value)
      .map((value) => value.format("YYYY-MM-DD"));
    expect(formattedXValues).toEqual(["2019-01-02", "2019-01-03"]);
  });

  it("should exclude values that cannot be parsed according to the column type", () => {
    const xValues = getXValuesForRows(
      [[["2019-01-02"], ["abc"], ["2019-01-03"]]],
      {
        "graph.x_axis.scale": "timeseries",
      },
    );
    const formattedXValues = xValues
      .filter((value): value is Dayjs => isObject(value) && "format" in value)
      .map((value) => value.format("YYYY-MM-DD"));
    expect(formattedXValues).toEqual(["2019-01-02", "2019-01-03"]);
  });
});

describe("parseXValue", () => {
  it("should use options as part of the cache key", () => {
    const value1 = parseXValue("2018-08-23", { isTimeseries: true });
    const value2 = parseXValue("2018-08-23", { isTimeseries: false });
    expect(dayjs.isDayjs(value1)).toBe(true);
    expect(dayjs.isDayjs(value2)).toBe(false);
  });

  it("should warn repeatedly (despite caching)", () => {
    const warn = jest.fn();
    parseXValue("2018-W60", { isTimeseries: true }, warn);
    parseXValue("2018-W60", { isTimeseries: true }, warn);
    expect(warn.mock.calls.length).toBe(2);
  });
});
