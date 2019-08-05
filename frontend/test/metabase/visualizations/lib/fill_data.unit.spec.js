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

    expect(filledData.length).toEqual(31);
    expect(filledData[0][1]).toEqual(1);
    expect(filledData[1][1]).toEqual(null);
    expect(filledData[30][1]).toEqual(2);
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

    expect(filledData.length).toEqual(97);
    expect(filledData[0][1]).toEqual(1);
    expect(filledData[1][1]).toEqual(null);
    expect(filledData[96][1]).toEqual(2);
  });

  it("should work with data in a different timezone", () => {
    // This is somewhat awkward. The test wants to check that we're correcting
    // for the local time default in `d3.time[interval].range`. The important
    // thing is to have offset not match the timezone where the test is being
    // run. We get the current offset and move it by one hour.
    const offset = (moment().utcOffset() + 60) % (12 * 60);
    const time1 = moment("2018-01-01").utcOffset(offset, true);
    const time2 = moment("2018-01-02").utcOffset(offset, true);
    const time3 = moment("2018-01-31").utcOffset(offset, true);
    const rows = [[time1, 1], [time2, 2], [time3, 3]];
    const [filledData] = fillMissingValuesInDatas(
      {
        series: [{}],
        settings: {
          "graph.x_axis.scale": "timeseries",
          series: () => ({ "line.missing": "zero" }),
        },
      },
      {
        xValues: [time1, time2, time3],
        xDomain: [time1, time3],
        xInterval: { interval: "day", count: 1 },
      },
      [rows],
    );

    // ensure that it didn't zero out provided values
    expect(filledData.length).toEqual(31);
    expect(filledData[0][1]).toEqual(1);
    expect(filledData[1][1]).toEqual(2);
    expect(filledData[2][1]).toEqual(0);
    expect(filledData[30][1]).toEqual(3);
  });

  it("should work with data in a different when passing through a DST boundary", () => {
    const offset = (moment().utcOffset() + 60) % (12 * 60);
    const time1 = moment("2019-03-01").utcOffset(offset, true);
    const time2 = moment("2019-03-30").utcOffset(offset, true);
    const time3 = moment("2019-03-31").utcOffset(offset, true);
    const rows = [[time1, 1], [time2, 2], [time3, 3]];
    const [filledData] = fillMissingValuesInDatas(
      {
        series: [{}],
        settings: {
          "graph.x_axis.scale": "timeseries",
          series: () => ({ "line.missing": "zero" }),
        },
      },
      {
        xValues: [time1, time2, time3],
        xDomain: [time1, time3],
        xInterval: { interval: "day", count: 1 },
      },
      [rows],
    );

    expect(filledData.length).toEqual(31);
    expect(filledData[0][1]).toEqual(1);
    expect(filledData[1][1]).toEqual(0);
    expect(filledData[29][1]).toEqual(2);
    expect(filledData[30][1]).toEqual(3);
  });
});
