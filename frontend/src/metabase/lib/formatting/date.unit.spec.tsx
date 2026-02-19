import {
  DATE_RANGE_FORMAT_SPECS,
  SPECIFIC_DATE_TIME_UNITS,
  formatDateTimeForParameter,
  formatDateTimeRangeWithUnit,
} from "metabase/lib/formatting/date";

describe("formatDateTimeRangeWithUnit", () => {
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
});
