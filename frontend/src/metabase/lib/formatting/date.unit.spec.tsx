import {
  formatDateTimeForParameter,
  formatDateTimeRangeWithUnit,
} from "metabase/lib/formatting/date";
import { OptionsType } from "metabase/lib/formatting/types";

describe("formatDateTimeRangeWithUnit", () => {
  const format = formatDateTimeRangeWithUnit;

  // use this to test that the variants of a single date (not a date range) will all be equal
  const singleDateVariants = (date: any) => [date, [date], [date, date]];

  // we use the tooltip type to test abbreviated dates
  const abbrev: OptionsType = { type: "tooltip" };

  it("should display year ranges", () => {
    const opts: OptionsType = {};
    const unit = "year";
    singleDateVariants("2018").forEach(d =>
      expect(format(d, unit, opts)).toBe("2018"),
    );
    expect(format(["2018", "2020"], unit, opts)).toBe("2018–2020");
  });
  it("should display quarter ranges", () => {
    const opts: OptionsType = {};
    const unit = "quarter";
    singleDateVariants("2018-01-01").forEach(d =>
      expect(format(d, unit, opts)).toBe("Q1 2018"),
    );
    expect(format(["2018-01-01", "2019-04-01"], unit, opts)).toBe(
      "Q1 2018 – Q2 2019",
    );
    expect(format(["2018-01-01", "2018-04-01"], unit, opts)).toBe(
      "Q1 2018 – Q2 2018",
    );
    expect(
      format(["2018-01-01", "2018-04-01"], unit, { ...opts, ...abbrev }),
    ).toBe("Q1–Q2 2018");
  });
  it("should display month ranges", () => {
    const opts: OptionsType = {};
    const unit = "month";
    singleDateVariants("2018-01-01").forEach(d =>
      expect(format(d, unit, opts)).toBe("January 2018"),
    );
    expect(format(["2018-01-01", "2019-04-01"], unit, opts)).toBe(
      "January 2018 – April 2019",
    );
    expect(format(["2018-01-01", "2018-04-01"], unit, opts)).toBe(
      "January 2018 – April 2018",
    );
    expect(
      format(["2018-01-01", "2018-04-01"], unit, { ...opts, ...abbrev }),
    ).toBe("January–April 2018");
  });
  it("should display day ranges for a single unit", () => {
    const opts: OptionsType = { ...abbrev };
    singleDateVariants("2018-01-01").forEach(d =>
      expect(format(d, "day", opts)).toBe("January 1, 2018"),
    );
    singleDateVariants("2018-01-01").forEach(d =>
      expect(format(d, "week", opts)).toBe("January 1–7, 2018"),
    );
  });
  it("should display day ranges between two units", () => {
    const opts: OptionsType = { ...abbrev };
    expect(format(["2018-01-01", "2018-01-02"], "day", opts)).toBe(
      "January 1–2, 2018",
    );
    expect(format(["2018-01-01", "2018-01-08"], "week", opts)).toBe(
      "January 1–14, 2018",
    );
  });
  it("should display time ranges", () => {
    expect(
      format(["2018-01-01T10:20", "2019-06-02T16:30"], "minute", {
        ...abbrev,
      }),
    ).toBe("January 1, 2018, 10:20 AM – June 2, 2019, 4:30 PM");
    expect(
      format(["2018-01-01T10:20", "2018-01-01T16:30"], "minute", {
        ...abbrev,
      }),
    ).toBe("January 1, 2018, 10:20 AM – 4:30 PM");
    expect(
      format(["2018-01-01T10:00", "2018-01-01T16:00"], "hour", {
        ...abbrev,
      }),
    ).toBe("January 1, 2018, 10:00 AM – 4:59 PM");
    singleDateVariants("2018-01-01T10:00").forEach(d =>
      expect(format(d, "hour", { ...abbrev })).toBe(
        "January 1, 2018, 10:00–59 AM",
      ),
    );
    singleDateVariants("2018-01-01T15:30").forEach(d =>
      expect(format(d, "minute", { ...abbrev })).toBe(
        "January 1, 2018, 3:30 PM",
      ),
    );
  });
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
