import moment from "moment";

import {
  getXValues,
  parseXValue,
} from "metabase/visualizations/lib/renderer_utils";

describe("getXValues", () => {
  function getXValuesForRows(listOfRows) {
    const series = listOfRows.map(rows => ({ data: { rows, cols: [{}] } }));
    series._raw = series;
    const settings = {};
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
    expect(getXValuesForRows([[[2], [11], [12]], [[1], [2], [11]]])).toEqual([
      1,
      2,
      11,
      12,
    ]);
  });
  it("should correctly merge multiple series of descending numbers", () => {
    expect(getXValuesForRows([[[12], [11], [2]], [[11], [2], [1]]])).toEqual([
      12,
      11,
      2,
      1,
    ]);
  });
  it("should use raw row ordering rather than broken out series", () => {
    const series = [
      // these are broken out series. the ordering here is ignored
      { data: { rows: [["bar"]], cols: [{}] } },
      { data: { rows: [["foo"]], cols: [{}] } },
    ];
    series._raw = [{ data: { rows: [["foo"], ["bar"]], cols: [{}] } }];
    const settings = {};
    expect(getXValues({ settings, series })).toEqual(["foo", "bar"]);
  });
  it("should sort values according to parsed value", () => {
    expect(
      getXValuesForRows([
        [["2019-W33"], ["2019-08-13"]],
        [["2019-08-11"], ["2019-W33"]],
      ]).map(x => x.format()),
    ).toEqual([
      "2019-08-11T00:00:00Z",
      "2019-08-12T00:00:00Z",
      "2019-08-13T00:00:00Z",
    ]);
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
