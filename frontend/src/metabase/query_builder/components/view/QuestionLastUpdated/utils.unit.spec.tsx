import dayjs from "dayjs";

import { getAbbreviatedRelativeTimeStrings, getTimePassedSince } from "./utils";

type TimePassedTest = { interval: number; unit: string; expected: string };

describe("getTimePassedSince", () => {
  const tests: TimePassedTest[] = [
    { interval: 1, unit: "second", expected: "1s" },
    { interval: 5, unit: "second", expected: "5s" },
    { interval: 1, unit: "minute", expected: "1min" },
    { interval: 5, unit: "minute", expected: "5min" },
    { interval: 1, unit: "hour", expected: "1h" },
    { interval: 5, unit: "hour", expected: "5h" },
    { interval: 1, unit: "day", expected: "1d" },
    { interval: 5, unit: "day", expected: "5d" },
    { interval: 1, unit: "month", expected: "1mo" },
    { interval: 5, unit: "month", expected: "5mo" },
    { interval: 1, unit: "year", expected: "1yr" },
    { interval: 5, unit: "year", expected: "5yr" },
  ];
  tests.forEach(test => {
    const { interval, unit, expected } = test;

    it(`${interval} ${unit}s ago -> ${expected}`, () => {
      expect(
        getTimePassedSince({
          timestamp: dayjs().subtract(interval, unit).toISOString(),
          relativeTimeStrings: getAbbreviatedRelativeTimeStrings(),
        }),
      ).toBe(expected);
    });
  });
});
