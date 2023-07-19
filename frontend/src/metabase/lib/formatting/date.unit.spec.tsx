import {
  formatDateTimeForParameter,
  formatDateTimeRangeWithUnit,
} from "metabase/lib/formatting/date";
import { DatetimeUnit } from "metabase-types/api";

describe("formatDateTimeRangeWithUnit", () => {
  // use this to test that the variants of a single date (not a date range) will all be equal
  const singleDateVariants = (date: any) => [date, [date], [date, date]];

  type DateRangeCase = {
    testing: string;
    unit: DatetimeUnit;
    input: string | [string, string];
    output: string;
    verboseOutput?: string;
  };
  const dateRangeCases: DateRangeCase[] = [
    {
      testing: "single year",
      unit: "year",
      input: "2018",
      output: "2018",
    },
    {
      testing: "year range",
      unit: "year",
      input: ["2018", "2020"],
      output: "2018–2020",
    },
    {
      testing: "single quarter",
      unit: "quarter",
      input: "2018-01-01",
      output: "Q1 2018",
    },
    {
      testing: "quarters across years",
      unit: "quarter",
      input: ["2018-01-01", "2019-04-01"],
      output: "Q1 2018 – Q2 2019",
    },
    {
      testing: "quarters inside a year",
      unit: "quarter",
      input: ["2018-01-01", "2018-04-01"],
      output: "Q1–Q2 2018",
      verboseOutput: "Q1 2018 – Q2 2018",
    },
    {
      testing: "single month",
      unit: "month",
      input: "2018-01-01",
      output: "January 2018",
    },
    {
      testing: "months across years",
      unit: "month",
      input: ["2018-01-01", "2019-04-01"],
      output: "January 2018 – April 2019",
    },
    {
      testing: "months inside a year",
      unit: "month",
      input: ["2018-01-01", "2018-04-01"],
      output: "January–April 2018",
      verboseOutput: "January 2018 – April 2018",
    },
    {
      testing: "single week",
      unit: "week",
      input: "2018-01-01",
      output: "January 1–7, 2018",
      verboseOutput: "January 1, 2018 – January 7, 2018",
    },
    {
      testing: "weeks inside a month",
      unit: "week",
      input: ["2018-01-01", "2018-01-08"],
      output: "January 1–14, 2018",
      verboseOutput: "January 1, 2018 – January 14, 2018",
    },
    {
      testing: "single day",
      unit: "day",
      input: "2018-01-01",
      output: "January 1, 2018",
    },
    {
      testing: "days inside a month",
      unit: "day",
      input: ["2018-01-01", "2018-01-02"],
      output: "January 1–2, 2018",
      verboseOutput: "January 1, 2018 – January 2, 2018",
    },
    {
      testing: "whole hour",
      unit: "hour",
      input: "2018-01-01T10:00",
      output: "January 1, 2018, 10:00–59 AM",
      verboseOutput: "January 1, 2018, 10:00 AM – January 1, 2018, 10:59 AM",
    },
    {
      testing: "hours inside a day",
      unit: "hour",
      input: ["2018-01-01T10:00", "2018-01-01T16:00"],
      output: "January 1, 2018, 10:00 AM – 4:59 PM",
      verboseOutput: "January 1, 2018, 10:00 AM – January 1, 2018, 4:59 PM",
    },
    {
      testing: "single minute",
      unit: "minute",
      input: "2018-01-01T15:30",
      output: "January 1, 2018, 3:30 PM",
    },
    {
      testing: "minutes across days",
      unit: "minute",
      input: ["2018-01-01T10:20", "2019-06-02T16:30"],
      output: "January 1, 2018, 10:20 AM – June 2, 2019, 4:30 PM",
    },
    {
      testing: "minutes inside a day",
      unit: "minute",
      input: ["2018-01-01T10:20", "2018-01-01T16:30"],
      output: "January 1, 2018, 10:20 AM – 4:30 PM",
      verboseOutput: "January 1, 2018, 10:20 AM – January 1, 2018, 4:30 PM",
    },
  ];
  it.each(dateRangeCases)(
    "should display $testing",
    ({ unit, input, output, verboseOutput = output }) => {
      const ranges = Array.isArray(input) ? [input] : singleDateVariants(input);
      ranges.forEach(range => {
        expect(
          formatDateTimeRangeWithUnit(range, unit, { type: "tooltip" }),
        ).toBe(output);
        expect(formatDateTimeRangeWithUnit(range, unit)).toBe(verboseOutput);
      });
    },
  );
});

describe("formatDateTimeForParameter", () => {
  const value = "2020-01-01T00:00:00+05:00";

  it("should format year", () => {
    expect(formatDateTimeForParameter(value, "year")).toBe(
      "2020-01-01~2020-12-31",
    );
  });

  it("should format quarter", () => {
    expect(formatDateTimeForParameter(value, "quarter")).toBe("Q1-2020");
  });

  it("should format month", () => {
    expect(formatDateTimeForParameter(value, "month")).toBe("2020-01");
  });

  it("should format week", () => {
    expect(formatDateTimeForParameter(value, "week")).toBe(
      "2019-12-29~2020-01-04",
    );
  });

  it("should format day", () => {
    expect(formatDateTimeForParameter(value, "day")).toBe("2020-01-01");
  });

  it("should format hour as a day", () => {
    expect(formatDateTimeForParameter(value, "hour")).toBe("2020-01-01");
  });

  it("should format minute", () => {
    expect(formatDateTimeForParameter(value, "minute")).toBe("2020-01-01");
  });

  it("should format quarter-of-year as a day", () => {
    expect(formatDateTimeForParameter(value, "quarter-of-year")).toBe(
      "2020-01-01",
    );
  });
});
