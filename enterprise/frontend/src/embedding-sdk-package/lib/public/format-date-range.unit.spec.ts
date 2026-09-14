import {
  formatDate,
  formatDateRange,
  parseDateString,
} from "./format-date-range";

const EN = { locale: "en-US" };

describe("parseDateString", () => {
  // Read back through the local getters so the assertion holds in every time
  // zone: the UTC-parsing bug this guards against shows up as `getDate() === 31`
  // west of Greenwich.
  it("builds a local-time date, not a UTC one", () => {
    const date = parseDateString("2026-09-01");

    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(8);
    expect(date?.getDate()).toBe(1);
  });

  it("rejects anything that is not YYYY-MM-DD", () => {
    expect(parseDateString("2026-9-1")).toBeNull();
    expect(parseDateString("09/01/2026")).toBeNull();
    expect(parseDateString("")).toBeNull();
  });
});

describe("formatDate", () => {
  it("formats a date string", () => {
    expect(formatDate("2026-09-01", EN)).toBe("Sep 1, 2026");
  });

  it("is empty for a missing or invalid value", () => {
    expect(formatDate(null, EN)).toBe("");
    expect(formatDate(undefined, EN)).toBe("");
    expect(formatDate("not a date", EN)).toBe("");
  });

  it("takes Intl options", () => {
    expect(
      formatDate("2026-09-01", {
        ...EN,
        format: { month: "long", day: "numeric" },
      }),
    ).toBe("September 1");
  });
});

describe("formatDateRange", () => {
  it("joins both ends", () => {
    expect(formatDateRange(["2026-09-01", "2026-09-10"], EN)).toBe(
      "Sep 1, 2026 – Sep 10, 2026",
    );
  });

  it("shows a half-picked range with a trailing separator", () => {
    expect(formatDateRange(["2026-09-01", null], EN)).toBe("Sep 1, 2026 – ");
  });

  it("is empty when nothing is picked", () => {
    expect(formatDateRange([null, null], EN)).toBe("");
    expect(formatDateRange(null, EN)).toBe("");
    expect(formatDateRange(undefined, EN)).toBe("");
  });

  it("takes a custom separator", () => {
    expect(
      formatDateRange(["2026-09-01", "2026-09-10"], {
        ...EN,
        separator: " to ",
      }),
    ).toBe("Sep 1, 2026 to Sep 10, 2026");
  });
});
