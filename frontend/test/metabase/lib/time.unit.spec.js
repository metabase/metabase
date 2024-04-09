import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage

import {
  getRelativeTimeAbbreviated,
  hoursToSeconds,
  isValidTimeInterval,
  msToHours,
  msToMinutes,
  msToSeconds,
  parseTime,
  parseTimestamp,
} from "metabase/lib/time";

describe("time", () => {
  describe("parseTimestamp", () => {
    const NY15_TOKYO = moment(1420038000000); // 2014-12-31 15:00 UTC
    const NY15_UTC = moment(1420070400000); // 2015-01-01 00:00 UTC
    const NY15_LA = moment(1420099200000); // 2015-01-01 00:00 UTC

    const TEST_CASES = [
      ["2015-01-01T00:00:00.000Z", 0, NY15_UTC],
      ["2015-01-01", 0, NY15_UTC],
      ["2015-01-01T00:00:00.000+00:00", 0, NY15_UTC],
      ["2015-01-01T00:00:00.000+0000", 0, NY15_UTC],
      ["2015-01-01T00:00:00Z", 0, NY15_UTC],
      [2015, 0, NY15_UTC],

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
          " should be parsed as moment reprsenting " +
          expectedMoment +
          " with the offset " +
          expectedOffset,
        () => {
          const result = parseTimestamp(str);

          expect(moment.isMoment(result)).toBe(true);
          expect(result.utcOffset()).toBe(expectedOffset);
          expect(result.unix()).toEqual(expectedMoment.unix());
        },
      );
    });

    // See https://github.com/metabase/metabase/issues/11615
    it("parse sqlite date with unit=year correctly", () => {
      const result = parseTimestamp("2015-01-01", "year");
      expect(moment.isMoment(result)).toBe(true);
      expect(result.unix()).toEqual(NY15_UTC.unix());
    });
  });

  describe("parseTime", () => {
    const PARSE_TIME_TESTS = [
      ["01:02:03.456+07:00", "1:02 AM"],
      ["01:02", "1:02 AM"],
      ["22:29:59.26816+01:00", "10:29 PM"],
      ["22:29:59.412459+01:00", "10:29 PM"],
      ["19:14:42.926221+01:00", "7:14 PM"],
      ["19:14:42.13202+01:00", "7:14 PM"],
      ["13:38:58.987352+01:00", "1:38 PM"],
      ["13:38:58.001001+01:00", "1:38 PM"],
      ["17:01:23+01:00", "5:01 PM"],
    ];

    test.each(PARSE_TIME_TESTS)(
      `parseTime(%p) to be %p`,
      (value, resultStr) => {
        const result = parseTime(value);
        expect(moment.isMoment(result)).toBe(true);
        expect(result.format("h:mm A")).toBe(resultStr);
      },
    );
  });

  describe("getRelativeTimeAbbreviated", () => {
    it("should show 'just now' for timestamps from the immediate past", () => {
      expect(
        getRelativeTimeAbbreviated(moment().subtract(30, "s").toString()),
      ).toEqual("just now");
    });

    it("should show a shortened string for times 1 minute+", () => {
      expect(
        getRelativeTimeAbbreviated(moment().subtract(61, "s").toString()),
      ).toEqual("1 m");

      expect(
        getRelativeTimeAbbreviated(moment().subtract(5, "d").toString()),
      ).toEqual("5 d");
    });
  });

  const SECOND = 1000;
  const MINUTE = 60 * 1000;
  const HOUR = MINUTE * 60;

  describe("msToSeconds", () => {
    [
      { value: 0, expected: 0 },
      { value: SECOND, expected: 1 },
      { value: 1.5 * SECOND, expected: 1.5 },
    ].forEach(({ value, expected }) => {
      it(`returns ${expected} for ${value}`, () => {
        expect(msToSeconds(value)).toBe(expected);
      });
    });
  });

  describe("msToMinutes", () => {
    [
      { value: 0, expected: 0 },
      { value: MINUTE, expected: 1 },
      { value: 2.5 * MINUTE, expected: 2.5 },
    ].forEach(({ value, expected }) => {
      it(`returns ${expected} for ${value}`, () => {
        expect(msToMinutes(value)).toBe(expected);
      });
    });
  });

  describe("msToHours", () => {
    [
      { value: 0, expected: 0 },
      { value: HOUR, expected: 1 },
      { value: 5.5 * HOUR, expected: 5.5 },
    ].forEach(({ value, expected }) => {
      it(`returns ${expected} for ${value}`, () => {
        expect(msToHours(value)).toBe(expected);
      });
    });
  });

  describe("hoursToSecond", () => {
    [
      { value: 0, expected: 0 },
      { value: 1, expected: 60 * 60 },
      { value: 2.5, expected: 2.5 * 60 * 60 },
    ].forEach(({ value, expected }) => {
      it(`returns ${expected} for ${value}`, () => {
        expect(hoursToSeconds(value)).toBe(expected);
      });
    });
  });

  describe("isValidTimeInterval", () => {
    it(`is not valid for 0 time span`, () => {
      expect(isValidTimeInterval(0, "days")).toBeFalsy();
    });

    it(`is valid for small time spans`, () => {
      expect(isValidTimeInterval(10, "days")).toBeTruthy();
    });

    it(`is not valid for large time spans`, () => {
      expect(isValidTimeInterval(1000000000, "years")).toBeFalsy();
    });
  });
});
