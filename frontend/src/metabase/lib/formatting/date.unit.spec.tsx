import { formatDateTimeRangeWithUnit } from "metabase/lib/formatting/date";
import { OptionsType } from "metabase/lib/formatting/types";

describe("formatDateTimeRangeWithUnit", () => {
  const format = formatDateTimeRangeWithUnit;

  // use this to test that the variants of a single date (not a date range) will all be equal
  const singleDateVariants = (date: any) => [date, [date], [date, date]];

  // we use the tooltip type to test abbreviated dates
  const abbrev: OptionsType = { type: "tooltip" };

  it("should display year ranges", () => {
    const opts: OptionsType = { date_resolution: "year" };
    const unit = "year";
    singleDateVariants("2018").forEach(d =>
      expect(format(d, unit, opts)).toBe("2018"),
    );
    expect(format(["2018", "2020"], unit, opts)).toBe("2018–2020");
  });
  it("should display quarter ranges", () => {
    const opts: OptionsType = { date_resolution: "quarter" };
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
    const opts: OptionsType = { date_resolution: "month" };
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
    singleDateVariants("2018-01-01").forEach(d =>
      expect(format(d, "month", opts)).toBe("January 1–31, 2018"),
    );
    singleDateVariants("2018-01-01").forEach(d =>
      expect(format(d, "quarter", opts)).toBe("January 1 – March 31, 2018"),
    );
    singleDateVariants("2018-01-01").forEach(d =>
      expect(format(d, "year", opts)).toBe("January 1 – December 31, 2018"),
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
    expect(format(["2018-01-01", "2018-02-01"], "month", opts)).toBe(
      "January 1 – February 28, 2018",
    );
    expect(format(["2018-01-01", "2018-04-01"], "quarter", opts)).toBe(
      "January 1 – June 30, 2018",
    );
    expect(format(["2018-01-01", "2019-01-01"], "year", opts)).toBe(
      "January 1, 2018 – December 31, 2019",
    );
  });
});
