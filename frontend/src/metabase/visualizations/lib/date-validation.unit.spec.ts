import { isValidISO_8601 } from "metabase/visualizations/lib/date-validation";

describe("isValidISO_8601", () => {
  // examples from https://en.wikipedia.org/wiki/ISO_8601
  const VALID_ISO_8601_DATES = [
    "2016-02-12",
    "2016-02-12T03:21:55+00:00",
    "2016-02-12T03:21:55Z",
    "20160212T032155Z",
    "2016-W06",
    "2016-W06-5",
    "2016-043",
    "2024-06-28 00:00:00",
  ];

  VALID_ISO_8601_DATES.forEach((isoDate) => {
    it(
      "should detect ISO 8601 formatted string '" + isoDate + "' as valid",
      () => {
        expect(isValidISO_8601(isoDate)).toBe(true);
      },
    );
  });

  const INVALID_DATES = ["100", "100 %", "scanner 005"];

  INVALID_DATES.forEach((notDate) => {
    it("should detect value '" + notDate + "' as invalid", () => {
      expect(isValidISO_8601(notDate)).toBe(false);
    });
  });

  it("should detect full calendar date", () => {
    expect(isValidISO_8601("2024-01-15")).toBe(true);
  });

  it("should detect datetime with timezone offset", () => {
    expect(isValidISO_8601("2024-01-15T14:30:00+05:30")).toBe(true);
  });

  it("should detect datetime with negative timezone offset", () => {
    expect(isValidISO_8601("2024-01-15T14:30:00-08:00")).toBe(true);
  });

  it("should detect datetime with milliseconds", () => {
    expect(isValidISO_8601("2024-01-15T14:30:00.123Z")).toBe(true);
  });

  it("should detect compact datetime format", () => {
    expect(isValidISO_8601("20240115T143000Z")).toBe(true);
  });

  it("should detect week date format", () => {
    expect(isValidISO_8601("2024-W03")).toBe(true);
  });

  it("should detect week date with day", () => {
    expect(isValidISO_8601("2024-W03-5")).toBe(true);
  });

  it("should detect ordinal date format", () => {
    expect(isValidISO_8601("2024-365")).toBe(true);
  });

  it("should detect space-separated datetime", () => {
    expect(isValidISO_8601("2024-01-15 14:30:00")).toBe(true);
  });

  it("should reject invalid month", () => {
    expect(isValidISO_8601("2024-13-01")).toBe(false);
  });

  it("should reject invalid day", () => {
    expect(isValidISO_8601("2024-01-32")).toBe(false);
  });

  it("should reject invalid hour", () => {
    expect(isValidISO_8601("2024-01-15T25:00:00Z")).toBe(false);
  });

  it("should reject invalid minute", () => {
    expect(isValidISO_8601("2024-01-15T14:60:00Z")).toBe(false);
  });

  it("should reject year before 1583", () => {
    expect(isValidISO_8601("1582-01-01")).toBe(false);
  });

  it("should accept year 1583", () => {
    expect(isValidISO_8601("1583-01-01")).toBe(true);
  });

  it("should accept leap second (60)", () => {
    expect(isValidISO_8601("2024-06-30T23:59:60Z")).toBe(true);
  });

  it("should reject empty string", () => {
    expect(isValidISO_8601("")).toBe(false);
  });

  it("should reject partial date", () => {
    expect(isValidISO_8601("2024-01")).toBe(false);
  });

  it("should reject invalid week number", () => {
    expect(isValidISO_8601("2024-W54")).toBe(false);
  });

  it("should reject invalid ordinal day", () => {
    expect(isValidISO_8601("2024-367")).toBe(false);
  });
});
