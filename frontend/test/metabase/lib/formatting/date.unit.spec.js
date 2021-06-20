import { formatDateTimeForParameter } from "metabase/lib/formatting/date";

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

  it("should format hour as a day", () => {
    expect(formatDateTimeForParameter(value, "minute")).toBe("2020-01-01");
  });

  it("should format quarter-of-year as a day", () => {
    expect(formatDateTimeForParameter(value, "quarter-of-year")).toBe(
      "2020-01-01",
    );
  });
});
