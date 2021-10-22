import moment from "moment";

import {
  maybeRoundValueToZero,
  stretchTimeseriesDomain,
} from "metabase/visualizations/lib/apply_axis";

describe("visualization.lib.apply_axis", () => {
  describe("stretchTimeseriesDomain", () => {
    it("should extend a partial month", () => {
      const domain = ["2020-04-01", "2020-06-01"].map(s => moment.utc(s));
      const dataInterval = { interval: "month", count: 1 };

      const newDomain = stretchTimeseriesDomain(domain, dataInterval);

      expect(newDomain.map(d => d.toISOString())).toEqual([
        "2020-03-09T00:00:00.000Z",
        "2020-06-24T00:00:00.000Z",
      ]);
    });

    it("should extend a partial week", () => {
      const domain = ["2020-04-01", "2020-04-15"].map(s => moment.utc(s));
      const dataInterval = { interval: "week", count: 1 };

      const newDomain = stretchTimeseriesDomain(domain, dataInterval);

      expect(newDomain.map(d => d.toISOString())).toEqual([
        "2020-03-27T00:00:00.000Z",
        "2020-04-20T00:00:00.000Z",
      ]);
    });

    it("should extend a partial day", () => {
      const domain = ["2020-04-01", "2020-04-05"].map(s => moment.utc(s));
      const dataInterval = { interval: "day", count: 1 };

      const newDomain = stretchTimeseriesDomain(domain, dataInterval);

      expect(newDomain.map(d => d.toISOString())).toEqual([
        "2020-03-31T06:00:00.000Z",
        "2020-04-05T18:00:00.000Z",
      ]);
    });
  });

  describe("maybeRoundValueToZero", () => {
    it("shouldn't change big values", () => {
      const value = maybeRoundValueToZero(0.2, [-1, 1]);

      expect(value).toBe(0.2);
    });

    it("should snap small values to zero", () => {
      const value = maybeRoundValueToZero(0.0000000000018, [-1, 1]);

      expect(value).toBe(0);
    });

    it("shouldn't snap small values to zero if the yExtent is small", () => {
      const value = maybeRoundValueToZero(0.0000000000018, [-1e-20, 1e-20]);

      expect(value).toBe(0.0000000000018);
    });
  });
});
