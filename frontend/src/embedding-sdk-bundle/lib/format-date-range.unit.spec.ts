import { formatDate, formatDateRange } from "./format-date-range";

describe("formatDate", () => {
  it("formats a date string in local time", () => {
    expect(formatDate("2026-09-01")).toBe("September 1, 2026");
  });

  it("takes a dayjs format", () => {
    expect(formatDate("2026-09-01", { format: "MMM D" })).toBe("Sep 1");
  });

  it("is empty for a missing or unparseable value", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("")).toBe("");
    expect(formatDate("not a date")).toBe("");
  });
});

describe("formatDateRange", () => {
  it("joins both ends", () => {
    expect(formatDateRange(["2026-09-01", "2026-09-10"])).toBe(
      "September 1, 2026 – September 10, 2026",
    );
  });

  it("shows a half-picked range with a trailing separator", () => {
    expect(formatDateRange(["2026-09-01", null])).toBe("September 1, 2026 – ");
  });

  it("is empty when nothing is picked", () => {
    expect(formatDateRange([null, null])).toBe("");
    expect(formatDateRange(null)).toBe("");
    expect(formatDateRange(undefined)).toBe("");
  });

  it("takes a format and a separator", () => {
    expect(
      formatDateRange(["2026-09-01", "2026-09-10"], {
        format: "MMM D",
        separator: "to",
      }),
    ).toBe("Sep 1 to Sep 10");
  });

  it("drops an unparseable end rather than labelling it", () => {
    expect(formatDateRange(["2026-09-01", "not a date"])).toBe(
      "September 1, 2026 – ",
    );
  });
});
