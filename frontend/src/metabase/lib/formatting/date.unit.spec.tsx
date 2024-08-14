import {
  DATE_RANGE_FORMAT_SPECS,
  formatDateTimeForParameter,
  formatDateTimeRangeWithUnit,
  SPECIFIC_DATE_TIME_UNITS,
} from "metabase/lib/formatting/date";

describe("formatDateTimeRangeWithUnit", () => {
  for (const unit of SPECIFIC_DATE_TIME_UNITS) {
    describe(`formats for unit ${unit}`, () => {
      const specs = DATE_RANGE_FORMAT_SPECS[unit];
      it("should have a default spec", () => {
        const defaultSpec = specs.find(spec => spec.same === null);
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
