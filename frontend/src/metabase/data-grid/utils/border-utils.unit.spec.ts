import { shouldHideRowBorder } from "./border-utils";

describe("shouldHideRowBorder", () => {
  it("should hide border on last row when showLastRowBorder is false", () => {
    expect(shouldHideRowBorder(4, 5, false)).toBe(true);
  });

  it("should show border on last row when showLastRowBorder is true", () => {
    expect(shouldHideRowBorder(4, 5, true)).toBe(false);
  });

  it("should always show border on non-last rows", () => {
    expect(shouldHideRowBorder(2, 5, false)).toBe(false);
    expect(shouldHideRowBorder(2, 5, true)).toBe(false);
  });

  it("should handle single row table", () => {
    expect(shouldHideRowBorder(0, 1, false)).toBe(true);
    expect(shouldHideRowBorder(0, 1, true)).toBe(false);
  });
});
