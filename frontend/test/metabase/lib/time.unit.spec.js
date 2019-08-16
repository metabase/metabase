import { changeOffset, parseTime, parseTimestamp } from "metabase/lib/time";
import moment from "moment";

describe("time", () => {
  describe("parseTimestamp", () => {
    const NY15_TOKYO = moment(1420038000000); // 2014-12-31 15:00 UTC
    const NY15_UTC = moment(1420070400000); // 2015-01-01 00:00 UTC
    const NY15_LA = moment(1420099200000); // 2015-01-01 00:00 UTC

    const TEST_CASES = [
      ["2015-01-01T00:00:00.000Z", 0, NY15_UTC],
      ["2015-01-01T00:00:00.000+00:00", 0, NY15_UTC],
      ["2015-01-01T00:00:00.000+0000", 0, NY15_UTC],
      ["2015-01-01T00:00:00Z", 0, NY15_UTC],

      ["2015-01-01T00:00:00.000+09:00", 540, NY15_TOKYO],
      ["2015-01-01T00:00:00.000+0900", 540, NY15_TOKYO],
      ["2015-01-01T00:00:00+09:00", 540, NY15_TOKYO],
      ["2015-01-01T00:00:00+0900", 540, NY15_TOKYO],

      ["2015-01-01T00:00:00.000-08:00", -480, NY15_LA],
      ["2015-01-01T00:00:00.000-0800", -480, NY15_LA],
      ["2015-01-01T00:00:00-08:00", -480, NY15_LA],
      ["2015-01-01T00:00:00-0800", -480, NY15_LA],
    ];

    TEST_CASES.map(([str, expectedOffset, expectedMoment]) => {
      it(
        str +
          " should be parsed as  moment reprsenting" +
          expectedMoment +
          "with the offset " +
          expectedOffset,
        () => {
          const result = parseTimestamp(str);

          expect(moment.isMoment(result)).toBe(true);
          expect(result.utcOffset()).toBe(expectedOffset);
          expect(result.unix()).toEqual(expectedMoment.unix());
        },
      );
    });
  });

  describe("parseTime", () => {
    it("parse timezones", () => {
      const result = parseTime("01:02:03.456+07:00");

      expect(moment.isMoment(result)).toBe(true);
      expect(result.format("h:mm A")).toBe("1:02 AM");
    });

    it("parse time without seconds", () => {
      const result = parseTime("01:02");

      expect(moment.isMoment(result)).toBe(true);
      expect(result.format("h:mm A")).toBe("1:02 AM");
    });
  });

  describe("changeOffset", () => {
    it("should no op for equal offsets", () => {
      const d = new Date("2019-01-23T12:34:56+10:00");

      const converted = changeOffset(d, 10, 10);

      expect(converted.format()).toBe("2019-01-23T12:34:56+10:00");
    });

    it("should update only the offset", () => {
      const d = new Date("2019-01-23T12:34:56-06:00");

      const converted = changeOffset(d, -6, 6);

      expect(converted.format()).toBe("2019-01-23T12:34:56+06:00");
    });
  });
});
