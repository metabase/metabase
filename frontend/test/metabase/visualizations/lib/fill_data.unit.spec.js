import moment from "moment";

import fillMissingValuesInDatas from "metabase/visualizations/lib/fill_data";

describe("fillMissingValuesInDatas", () => {
  it("should fill missing days", () => {
    const time1 = moment("2018-01-01");
    const time2 = moment("2018-01-31");
    const rows = [[time1, 1], [time2, 2]];
    const [filledData] = fillMissingValuesInDatas(
      {
        series: [{}],
        settings: {
          "graph.x_axis.scale": "timeseries",
          series: () => ({ "line.missing": "none" }),
        },
      },
      {
        xValues: [time1, time2],
        xDomain: [time1, time2],
        xInterval: { interval: "day", count: 1 },
      },
      [rows],
    );

    const yValues = filledData.map(d => d[1]);
    expect(yValues).toEqual([1, ...new Array(29).fill(null), 2]);
  });

  it("should fill missing hours", () => {
    const time1 = moment("2018-01-01");
    const time2 = moment("2018-01-05");
    const rows = [[time1, 1], [time2, 2]];
    const [filledData] = fillMissingValuesInDatas(
      {
        series: [{}],
        settings: {
          "graph.x_axis.scale": "timeseries",
          series: () => ({ "line.missing": "none" }),
        },
      },
      {
        xValues: [time1, time2],
        xDomain: [time1, time2],
        xInterval: { interval: "hour", count: 1 },
      },
      [rows],
    );

    const yValues = filledData.map(d => d[1]);
    expect(yValues).toEqual([1, ...new Array(95).fill(null), 2]);
  });

  it("should fill linear data", () => {
    const [filledData] = fillMissingValuesInDatas(
      {
        series: [{}],
        settings: {
          "graph.x_axis.scale": "linear",
          series: () => ({ "line.missing": "none" }),
        },
      },
      { xValues: [1, 3], xDomain: [1, 3], xInterval: 1 },
      [[[1, 1], [3, 1]]],
    );

    expect(filledData).toEqual([[1, 1], [2, null], [3, 1]]);
  });

  it("should fill with zeros", () => {
    const [filledData] = fillMissingValuesInDatas(
      {
        series: [{}],
        settings: {
          "graph.x_axis.scale": "linear",
          series: () => ({ "line.missing": "zero" }),
        },
      },
      { xValues: [1, 3], xDomain: [1, 3], xInterval: 1 },
      [[[1, 1], [3, 1]]],
    );

    expect(filledData).toEqual([[1, 1], [2, 0], [3, 1]]);
  });

  it("shouldn't fill data when line.missing = interpolate", () => {
    const [filledData] = fillMissingValuesInDatas(
      {
        series: [{}],
        settings: {
          "graph.x_axis.scale": "linear",
          series: () => ({ "line.missing": "interpolate" }),
        },
      },
      { xValues: [1, 3], xDomain: [1, 3], xInterval: 1 },
      [[[1, 1], [3, 1]]],
    );

    expect(filledData).toEqual([[1, 1], [3, 1]]);
  });
});
