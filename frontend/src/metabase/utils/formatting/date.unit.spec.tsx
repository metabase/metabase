import dayjs from "dayjs";

import {
  DATE_RANGE_FORMAT_SPECS,
  SPECIFIC_DATE_TIME_UNITS,
  formatDateTimeForParameter,
  formatDateTimeRangeWithUnit,
  formatDateTimeWithUnit,
} from "metabase/utils/formatting/date";

import "dayjs/locale/es";
import "dayjs/locale/fr";

describe("formatDateTimeRangeWithUnit", () => {
  afterEach(() => {
    dayjs.locale("en");
  });

  for (const unit of SPECIFIC_DATE_TIME_UNITS) {
    describe(`formats for unit ${unit}`, () => {
      const specs = DATE_RANGE_FORMAT_SPECS[unit];

      it("should have a default spec", () => {
        const defaultSpec = specs.find((spec) => spec.same === null);
        expect(defaultSpec).toBeDefined();
      });

      for (const spec of specs) {
        const {
          same,
          tests: { verbose, compact, removedYear, removedDay },
        } = spec;

        const inside = same
          ? `inside the same ${same}`
          : "with no units in common";

        if (verbose) {
          const { output, verboseOutput, input } = verbose;

          it(`should correctly format a ${unit} range ${inside}`, () => {
            const options = { type: "tooltip" };

            expect(formatDateTimeRangeWithUnit(input, unit, options)).toBe(
              output,
            );

            if (verboseOutput) {
              // eslint-disable-next-line jest/no-conditional-expect
              expect(formatDateTimeRangeWithUnit(input, unit)).toBe(
                verboseOutput,
              );
            }
          });
        }

        if (compact) {
          const { output, input } = compact;

          it(`(options.compact) should correctly compact format a ${unit} range ${inside}`, () => {
            const options = { compact: true };

            expect(formatDateTimeRangeWithUnit(input, unit, options)).toBe(
              output,
            );
          });
        }

        if (removedYear) {
          const { output, input } = removedYear;

          it(`(options.removeYear) should correctly format a ${unit} range ${inside} with the year removed`, () => {
            const options = { type: "tooltip", removeYear: true };

            expect(formatDateTimeRangeWithUnit(input, unit, options)).toBe(
              output,
            );
          });
        }

        if (removedDay) {
          const { output, input } = removedDay;

          it(`(options.removeDay) should correctly format a ${unit} range ${inside} with the day removed`, () => {
            const options = { type: "tooltip", removeDay: true };

            expect(formatDateTimeRangeWithUnit(input, unit, options)).toBe(
              output,
            );
          });
        }
      }
    });
  }
});

describe("formatDateTimeRangeWithUnit with date_style", () => {
  it("should format M/D/YYYY style in cells", () => {
    const input: [string] = ["2017-01-01"]; // Week: 2017-01-01 to 2017-01-07
    const options = { type: "cell" as const, date_style: "M/D/YYYY" };

    expect(formatDateTimeRangeWithUnit(input, "week", options)).toBe(
      "1/1/2017 – 1/7/2017",
    );
  });

  it("should format D/M/YYYY style in cells", () => {
    const input: [string] = ["2017-01-01"]; // Week: 2017-01-01 to 2017-01-07
    const options = { type: "cell" as const, date_style: "D/M/YYYY" };

    expect(formatDateTimeRangeWithUnit(input, "week", options)).toBe(
      "1/1/2017 – 7/1/2017",
    );
  });

  it("should format YYYY/M/D style in cells", () => {
    const input: [string] = ["2017-01-01"]; // Week: 2017-01-01 to 2017-01-07
    const options = { type: "cell" as const, date_style: "YYYY/M/D" };

    expect(formatDateTimeRangeWithUnit(input, "week", options)).toBe(
      "2017/1/1 – 2017/1/7",
    );
  });

  it("should format D MMMM, YYYY style in cells", () => {
    const input: [string] = ["2017-01-01"]; // Week: 2017-01-01 to 2017-01-07
    const options = { type: "cell" as const, date_style: "D MMMM, YYYY" };

    expect(formatDateTimeRangeWithUnit(input, "week", options)).toBe(
      "1 January, 2017 – 7 January, 2017",
    );
  });

  it("should format week across months with M/D/YYYY in cells", () => {
    const input: [string] = ["2017-01-29"]; // Week: 2017-01-29 to 2017-02-04
    const options = { type: "cell" as const, date_style: "M/D/YYYY" };

    expect(formatDateTimeRangeWithUnit(input, "week", options)).toBe(
      "1/29/2017 – 2/4/2017",
    );
  });

  it("should format week across years with M/D/YYYY in cells", () => {
    const input: [string] = ["2017-12-31"]; // Week: 2017-12-31 to 2018-01-06
    const options = { type: "cell" as const, date_style: "M/D/YYYY" };

    expect(formatDateTimeRangeWithUnit(input, "week", options)).toBe(
      "12/31/2017 – 1/6/2018",
    );
  });

  it("should respect custom separator with M/D/YYYY style", () => {
    const input: [string] = ["2017-01-01"]; // Week: 2017-01-01 to 2017-01-07
    const options = {
      type: "cell" as const,
      date_style: "M/D/YYYY",
      date_separator: "-",
    };

    expect(formatDateTimeRangeWithUnit(input, "week", options)).toBe(
      "1-1-2017 – 1-7-2017",
    );
  });
});

describe("formatDateTimeForParameter", () => {
  const value = "2020-01-01T06:00:00+05:00";

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

  it("should format hour", () => {
    expect(formatDateTimeForParameter(value, "hour")).toBe("2020-01-01T06:00");
  });

  it("should format minute", () => {
    expect(formatDateTimeForParameter(value, "minute")).toBe(
      "2020-01-01T06:00",
    );
  });

  it("should format quarter-of-year as a day", () => {
    expect(formatDateTimeForParameter(value, "quarter-of-year")).toBe(
      "2020-01-01",
    );
  });

  describe("formatDateTimeWithUnit", () => {
    afterEach(() => {
      dayjs.locale("en");
    });

    it("should format week ranges", () => {
      expect(
        formatDateTimeWithUnit("2019-07-07T00:00:00.000Z", "week", {
          type: "cell",
        }),
      ).toEqual("July 7, 2019 – July 13, 2019");
    });

    it("should always format week ranges according to returned data", () => {
      dayjs.locale("es");
      dayjs.updateLocale(dayjs.locale(), { weekStart: 0 });

      expect(
        formatDateTimeWithUnit("2019-07-07T00:00:00.000Z", "week", {
          type: "cell",
        }),
      ).toEqual("julio 7, 2019 – julio 13, 2019");
    });

    it("should format days of week with default options", () => {
      expect(formatDateTimeWithUnit("mon", "day-of-week")).toEqual("Monday");
    });

    it("should format days of week with compact option", () => {
      const options = {
        compact: true,
      };

      expect(formatDateTimeWithUnit("sun", "day-of-week", options)).toEqual(
        "Sun",
      );
    });

    it("should format days of week with exclude option", () => {
      const options = {
        isExclude: true,
      };

      expect(
        formatDateTimeWithUnit("2022-04-25", "day-of-week", options),
      ).toEqual("Monday");
    });

    it("should format hours of day with exclude option", () => {
      const options = {
        isExclude: true,
      };

      expect(
        formatDateTimeWithUnit(
          "2022-04-27T06:00:00.000Z",
          "hour-of-day",
          options,
        ),
      ).toEqual("6 AM");
    });

    test.each([
      ["minute", "Wed, April 27, 2022, 6:00 AM"],
      ["hour", "Wed, April 27, 2022, 6:00 AM"],
      ["day", "Wed, April 27, 2022"],
      ["week", "Wed, April 27, 2022"],
      ["month", "April 2022"],
      ["year", "2022"],
    ] as const)(
      "should include weekday when date unit is smaller than or equal to a week",
      (unit, formatted) => {
        const dateString = "2022-04-27T06:00:00.000Z";

        expect(
          formatDateTimeWithUnit(dateString, unit, {
            weekday_enabled: true,
          }),
        ).toEqual(formatted);
      },
    );

    describe("day-of-year formatting", () => {
      it("should format day-of-year as plain number", () => {
        expect(formatDateTimeWithUnit(1, "day-of-year")).toEqual(1);
        expect(formatDateTimeWithUnit(100, "day-of-year")).toEqual(100);
        expect(formatDateTimeWithUnit(365, "day-of-year")).toEqual(365);
      });

      it("should format day-of-year from date strings", () => {
        // January 1st = day 1
        expect(formatDateTimeWithUnit("2023-01-01", "day-of-year")).toEqual(1);
        // February 1st = day 32 (31 days in January + 1)
        expect(formatDateTimeWithUnit("2023-02-01", "day-of-year")).toEqual(32);
        // December 31st = day 365 (non-leap year)
        expect(formatDateTimeWithUnit("2023-12-31", "day-of-year")).toEqual(
          365,
        );
      });

      it("should handle leap year correctly", () => {
        // December 31st in a leap year = day 366
        expect(formatDateTimeWithUnit("2020-12-31", "day-of-year")).toEqual(
          366,
        );
        // February 29th in a leap year = day 60
        expect(formatDateTimeWithUnit("2020-02-29", "day-of-year")).toEqual(60);
      });
    });

    describe("week-of-year formatting", () => {
      it("should format week numbers with ordinal suffixes", () => {
        expect(formatDateTimeWithUnit(1, "week-of-year")).toEqual("1st");
        expect(formatDateTimeWithUnit(2, "week-of-year")).toEqual("2nd");
        expect(formatDateTimeWithUnit(3, "week-of-year")).toEqual("3rd");
        expect(formatDateTimeWithUnit(4, "week-of-year")).toEqual("4th");
        expect(formatDateTimeWithUnit(21, "week-of-year")).toEqual("21st");
        expect(formatDateTimeWithUnit(22, "week-of-year")).toEqual("22nd");
        expect(formatDateTimeWithUnit(23, "week-of-year")).toEqual("23rd");
        expect(formatDateTimeWithUnit(24, "week-of-year")).toEqual("24th");
        expect(formatDateTimeWithUnit(53, "week-of-year")).toEqual("53rd");
      });

      it("should handle edge cases for ordinal suffixes", () => {
        expect(formatDateTimeWithUnit(11, "week-of-year")).toEqual("11th");
        expect(formatDateTimeWithUnit(12, "week-of-year")).toEqual("12th");
        expect(formatDateTimeWithUnit(13, "week-of-year")).toEqual("13th");
      });

      it("should format week-of-year from date strings", () => {
        // January 1st, 2023 (Sunday) is in week 52 of 2022 (ISO week)
        const week1 = formatDateTimeWithUnit("2023-01-02", "week-of-year"); // Monday Jan 2 is week 1
        expect(week1).toMatch(/^1[a-z]+$/);

        // Mid-year dates
        const midYear = formatDateTimeWithUnit("2023-06-15", "week-of-year");
        expect(midYear).toMatch(/^2[0-9][a-z]+$/);

        // End of year
        const endYear = formatDateTimeWithUnit("2023-12-25", "week-of-year");
        expect(endYear).toMatch(/^5[0-3][a-z]+$/);
      });

      it("should remove square brackets from English ordinals", () => {
        expect(formatDateTimeWithUnit(1, "week-of-year")).toEqual("1st");
        expect(formatDateTimeWithUnit(2, "week-of-year")).toEqual("2nd");
        expect(formatDateTimeWithUnit(3, "week-of-year")).toEqual("3rd");
      });

      it("should handle non-English locales where ordinals are not wrapped in brackets (#66658)", () => {
        const originalLocale = dayjs.locale();
        try {
          dayjs.locale("fr");
          expect(formatDateTimeWithUnit(1, "week-of-year")).toEqual("1er");
          expect(formatDateTimeWithUnit(2, "week-of-year")).toEqual("2");
          expect(formatDateTimeWithUnit(3, "week-of-year")).toEqual("3");
        } finally {
          dayjs.locale(originalLocale);
        }
      });
    });
  });
});
