import moment from "moment";

import fillMissingValuesInDatas from "metabase/visualizations/lib/fill_data";

describe("fillMissingValuesInDatas", () => {
  it("should fill missing days", () => {
    const time1 = moment("2018-01-01T00:00:00Z");
    const time2 = moment("2018-01-31T00:00:00Z");
    const rows = [
      [time1, 1],
      [time2, 2],
    ];
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
        xInterval: { interval: "day", count: 1, timezone: "Etc/UTC" },
      },
      [rows],
    );

    const yValues = filledData.map(d => d[1]);
    expect(yValues).toEqual([1, ...new Array(29).fill(null), 2]);
  });

  it("should fill missing hours", () => {
    const time1 = moment("2018-01-01T00:00:00Z");
    const time2 = moment("2018-01-05T00:00:00Z");
    const rows = [
      [time1, 1],
      [time2, 2],
    ];
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
        xInterval: { interval: "hour", count: 1, timezone: "Etc/UTC" },
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
      [
        [
          [1, 1],
          [3, 1],
        ],
      ],
    );

    expect(filledData).toEqual([
      [1, 1],
      [2, null],
      [3, 1],
    ]);
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
      [
        [
          [1, 1],
          [3, 1],
        ],
      ],
    );

    expect(filledData).toEqual([
      [1, 1],
      [2, 0],
      [3, 1],
    ]);
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
      [
        [
          [1, 1],
          [3, 1],
        ],
      ],
    );

    expect(filledData).toEqual([
      [1, 1],
      [3, 1],
    ]);
  });

  it("shouldn't fill data when the range is >10k", () => {
    const [filledData] = fillMissingValuesInDatas(
      {
        series: [{}],
        settings: {
          "graph.x_axis.scale": "linear",
          series: () => ({ "line.missing": "zero" }),
        },
      },
      { xValues: [1, 11000], xDomain: [1, 11000], xInterval: 1 },
      [
        [
          [1, 1],
          [11000, 1],
        ],
      ],
    );

    expect(filledData).toEqual([
      [1, 1],
      [11000, 1],
    ]);
  });

  it("shouldn't fill data when the range is >10k for timeseries", () => {
    const t1 = moment("2018-01-01T00:00:00Z");
    const t2 = moment("2020-01-01T00:00:00Z");
    const [filledData] = fillMissingValuesInDatas(
      {
        series: [{}],
        settings: {
          "graph.x_axis.scale": "timeseries",
          series: () => ({ "line.missing": "zero" }),
        },
      },
      {
        xValues: [t1, t2],
        xDomain: [t1, t2],
        xInterval: { interval: "hour", count: 1, timezone: "Etc/UTC" },
      },
      [
        [
          [t1, 1],
          [t2, 1],
        ],
      ],
    );

    expect(filledData).toEqual([
      [t1, 1],
      [t2, 1],
    ]);
  });

  it("should use interval while filling numeric data", () => {
    const [filledData] = fillMissingValuesInDatas(
      {
        series: [{}],
        settings: {
          "graph.x_axis.scale": "linear",
          series: () => ({ "line.missing": "zero" }),
        },
      },
      { xValues: [10, 30], xDomain: [10, 30], xInterval: 10 },
      [
        [
          [10, 1],
          [30, 1],
        ],
      ],
    );

    expect(filledData).toEqual([
      [10, 1],
      [20, 0],
      [30, 1],
    ]);
  });

  it("should maintain _origin on rows", () => {
    // the _origin property is used in tooltips, so make sure it's carried over
    const row = [1, 1];
    row._origin = [1, 1, 2, 3];
    const [[{ _origin }]] = fillMissingValuesInDatas(
      {
        series: [{}],
        settings: {
          "graph.x_axis.scale": "linear",
          series: () => ({ "line.missing": "zero" }),
        },
      },
      { xValues: [1], xDomain: [1, 1], xInterval: 1 },
      [[row]],
    );

    expect(_origin).toEqual([1, 1, 2, 3]);
  });
});
