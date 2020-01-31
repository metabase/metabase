import moment from "moment";

import timeseriesScale from "metabase/visualizations/lib/timeseriesScale";

describe("timeseriesScale", () => {
  it("should create day ranges", () => {
    const scale = timeseriesScale({
      interval: "day",
      count: 1,
      timezone: "Etc/UTC",
    }).domain([
      moment("2019-03-08T00:00:00.000Z"),
      moment("2019-03-12T00:00:00.000Z"),
    ]);

    expect(scale.ticks().map(t => t.toISOString())).toEqual([
      "2019-03-08T00:00:00.000Z",
      "2019-03-09T00:00:00.000Z",
      "2019-03-10T00:00:00.000Z",
      "2019-03-11T00:00:00.000Z",
      "2019-03-12T00:00:00.000Z",
    ]);
  });

  it("should create day ranges in pacific time across dst boundary", () => {
    const scale = timeseriesScale({
      interval: "day",
      count: 1,
      timezone: "US/Pacific",
    }).domain([
      moment("2019-03-08T00:00:00.000-08"),
      moment("2019-03-12T00:00:00.000-07"),
    ]);

    expect(scale.ticks().map(t => t.toISOString())).toEqual([
      "2019-03-08T08:00:00.000Z",
      "2019-03-09T08:00:00.000Z",
      "2019-03-10T08:00:00.000Z",
      "2019-03-11T07:00:00.000Z",
      "2019-03-12T07:00:00.000Z",
    ]);
  });

  it("should create hour ranges in pacific time across spring dst boundary", () => {
    const scale = timeseriesScale({
      interval: "hour",
      count: 1,
      timezone: "US/Pacific",
    }).domain([
      moment("2019-03-10T00:00:00.000-08"),
      moment("2019-03-10T04:00:00.000-07"),
    ]);

    expect(scale.ticks().map(t => t.format())).toEqual([
      "2019-03-10T00:00:00-08:00",
      "2019-03-10T01:00:00-08:00",
      "2019-03-10T03:00:00-07:00",
      "2019-03-10T04:00:00-07:00",
    ]);
  });

  it("should create hour ranges in pacific time across fall dst boundary", () => {
    const scale = timeseriesScale({
      interval: "hour",
      count: 1,
      timezone: "US/Pacific",
    }).domain([
      moment("2019-11-03T00:00:00.000-07"),
      moment("2019-11-03T04:00:00.000-08"),
    ]);

    expect(scale.ticks().map(t => t.format())).toEqual([
      "2019-11-03T00:00:00-07:00",
      "2019-11-03T01:00:00-07:00",
      "2019-11-03T01:00:00-08:00",
      "2019-11-03T02:00:00-08:00",
      "2019-11-03T03:00:00-08:00",
      "2019-11-03T04:00:00-08:00",
    ]);
  });

  it("should create day ranges that don't align with UTC hours", () => {
    const scale = timeseriesScale({
      interval: "day",
      count: 1,
      timezone: "Asia/Kathmandu",
    }).domain([
      moment("2019-01-01T18:15:00.000Z"),
      moment("2019-01-03T18:15:00.000Z"),
    ]);

    expect(scale.ticks().map(t => t.toISOString())).toEqual([
      "2019-01-01T18:15:00.000Z",
      "2019-01-02T18:15:00.000Z",
      "2019-01-03T18:15:00.000Z",
    ]);
  });

  it("should create day ranges when the domain doesn't line up with unit boundaries", () => {
    const scale = timeseriesScale({
      interval: "day",
      count: 1,
      timezone: "Etc/UTC",
    }).domain([
      moment("2019-03-07T12:34:56.789Z"),
      moment("2019-03-12T12:34:56.789Z"),
    ]);

    expect(scale.ticks().map(t => t.toISOString())).toEqual([
      "2019-03-08T00:00:00.000Z",
      "2019-03-09T00:00:00.000Z",
      "2019-03-10T00:00:00.000Z",
      "2019-03-11T00:00:00.000Z",
      "2019-03-12T00:00:00.000Z",
    ]);
  });

  it("should create empty ranges if there are no ticks in domain", () => {
    const scale = timeseriesScale({
      interval: "day",
      count: 1,
      timezone: "Etc/UTC",
    }).domain([
      moment("2019-03-09T01:00:00.000Z"),
      moment("2019-03-09T22:00:00.000Z"),
    ]);

    expect(scale.ticks().length).toBe(0);
  });

  it("should create month ranges in timezone", () => {
    const scale = timeseriesScale({
      interval: "month",
      count: 1,
      timezone: "Asia/Hong_kong",
    }).domain([
      moment("2019-03-07T12:34:56.789Z"),
      moment("2019-04-12T12:34:56.789Z"),
    ]);

    expect(scale.ticks().map(t => t.toISOString())).toEqual([
      "2019-03-31T16:00:00.000Z",
    ]);
  });

  it("should create month ranges spaced by count", () => {
    const scale = timeseriesScale({
      interval: "month",
      count: 3,
      timezone: "Etc/UTC",
    }).domain([
      moment("2018-11-01T00:00:00.000Z"),
      moment("2020-02-01T00:00:00.000Z"),
    ]);

    expect(scale.ticks().map(t => t.toISOString())).toEqual([
      "2019-01-01T00:00:00.000Z",
      "2019-04-01T00:00:00.000Z",
      "2019-07-01T00:00:00.000Z",
      "2019-10-01T00:00:00.000Z",
      "2020-01-01T00:00:00.000Z",
    ]);
  });

  it("should create 50 year ranges", () => {
    const scale = timeseriesScale({
      interval: "year",
      count: 50,
      timezone: "Etc/UTC",
    }).domain([
      moment("1890-01-01T00:00:00.000Z"),
      moment("2020-01-01T00:00:00.000Z"),
    ]);

    expect(scale.ticks().map(t => t.toISOString())).toEqual([
      "1900-01-01T00:00:00.000Z",
      "1950-01-01T00:00:00.000Z",
      "2000-01-01T00:00:00.000Z",
    ]);
  });

  for (const unit of ["month", "quarter", "year"]) {
    it(`should produce results with ${unit}s`, () => {
      const ticks = timeseriesScale({
        interval: unit,
        count: 1,
        timezone: "Etc/UTC",
      })
        .domain([
          moment("1999-12-31T23:59:59Z"),
          moment("2001-01-01T00:00:01Z"),
        ])
        .ticks();

      // we're just ensuring that it produces some results and that the first
      // and last are correctly rounded regardless of unit
      expect(ticks[0].toISOString()).toEqual("2000-01-01T00:00:00.000Z");
      expect(ticks[ticks.length - 1].toISOString()).toEqual(
        "2001-01-01T00:00:00.000Z",
      );
    });
  }

  // same as above but with a smaller range so the test runs faster
  for (const unit of ["minute", "hour", "day"]) {
    it(`should produce results with ${unit}s`, () => {
      const ticks = timeseriesScale({
        interval: unit,
        count: 1,
        timezone: "Etc/UTC",
      })
        .domain([
          moment("1999-12-31T23:59:59Z"),
          moment("2000-01-02T00:00:01Z"),
        ])
        .ticks();

      expect(ticks[0].toISOString()).toEqual("2000-01-01T00:00:00.000Z");
      expect(ticks[ticks.length - 1].toISOString()).toEqual(
        "2000-01-02T00:00:00.000Z",
      );
    });
  }

  // weeks are split out because their boundaries don't align with other units
  it(`should produce results with weeks`, () => {
    const ticks = timeseriesScale({
      interval: "week",
      count: 1,
      timezone: "Etc/UTC",
    })
      .domain([moment("2000-01-02T12:34:56Z"), moment("2000-02-02T12:34:56Z")])
      .ticks();

    expect(ticks[0].toISOString()).toEqual("2000-01-09T00:00:00.000Z");
    expect(ticks[ticks.length - 1].toISOString()).toEqual(
      "2000-01-30T00:00:00.000Z",
    );
  });

  it("should evenly space months", () => {
    const scale = timeseriesScale({
      interval: "month",
      count: 1,
      timezone: "Etc/UTC",
    })
      .domain([
        moment("2018-11-01T00:00:00.000Z"),
        moment("2019-02-01T00:00:00.000Z"),
      ])
      .range([0, 30]);

    expect(
      ["2018-11-01", "2018-12-01", "2019-01-01", "2019-02-01"].map(d =>
        scale(moment(`${d}T00:00:00.000Z`)),
      ),
    ).toEqual([0, 10, 20, 30]);
  });

  it("should work for one 'evenly spaced' month", () => {
    const scale = timeseriesScale({
      interval: "month",
      count: 1,
      timezone: "Etc/UTC",
    })
      .domain([
        moment("2018-11-15T00:00:00.000Z"),
        moment("2018-12-15T00:00:00.000Z"),
      ])
      .range([0, 30]);

    expect(
      ["2018-11-15", "2018-12-15"].map(d =>
        scale(moment(`${d}T00:00:00.000Z`)),
      ),
    ).toEqual([0, 30]);
  });

  it("should not evenly space years", () => {
    // 2020 is a leap year and 2019 is not. With the total width set to the
    // total number of days, each year should have one pixel per day.
    const scale = timeseriesScale({
      interval: "year",
      count: 1,
      timezone: "Etc/UTC",
    })
      .domain([
        moment("2019-01-01T00:00:00.000Z"),
        moment("2021-01-01T00:00:00.000Z"),
      ])
      .range([0, 731]);

    expect(
      ["2019-01-01", "2020-01-01", "2021-01-01"].map(d =>
        scale(moment(`${d}T00:00:00.000Z`)),
      ),
    ).toEqual([0, 365, 731]);
  });

  it("should not evenly space DST-transition days", () => {
    // 2019-11-03 is a 25 hour day in US/Pacific
    const scale = timeseriesScale({
      interval: "day",
      count: 1,
      timezone: "US/Pacific",
    })
      .domain([
        moment("2019-11-02T00:00:00.000-07"),
        moment("2019-11-04T00:00:00.000-08"),
      ])
      .range([0, 49]);

    expect(
      [
        "2019-11-02T00:00:00.000-07",
        "2019-11-03T00:00:00.000-07",
        "2019-11-04T00:00:00.000-08",
      ].map(d => scale(moment(d))),
    ).toEqual([0, 24, 49]);
  });

  it("should handle a stretched domain", () => {
    // We extend the domain by a partial month as a margin on charts. Full
    // months are evenly spaced, but the partial months on either end should
    // not match that spacing.
    // In this example, Febuary and January should appear as the same length
    // (30 pixels), and the 10 day spacers should appear as 10 pixels.
    const scale = timeseriesScale({
      interval: "month",
      count: 1,
      timezone: "Etc/UTC",
    })
      .domain([
        moment("2019-12-22T00:00:00.000Z"),
        moment("2020-03-11T00:00:00.000Z"),
      ])
      .range([0, 80]);

    expect(
      [
        "2019-12-22",
        "2020-01-01",
        "2020-02-01",
        "2020-03-01",
        "2020-03-11",
      ].map(d => scale(moment(`${d}T00:00:00.000Z`))),
    ).toEqual([0, 10, 40, 70, 80]);
  });
});
