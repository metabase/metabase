import { getGridColumns } from "./grid-columns";

describe("getGridColumns", () => {
  it("should return 1 column when width is less than MIN_SERIES_WIDTH", () => {
    expect(getGridColumns(200, 5)).toBe(1);
  });

  it("should return 1 column when width is 0", () => {
    expect(getGridColumns(0, 5)).toBe(1);
  });

  it("should calculate columns based on width", () => {
    expect(getGridColumns(900, 10)).toBe(3);
  });

  it("should not exceed the series count", () => {
    expect(getGridColumns(1200, 2)).toBe(2);
  });

  it("should not exceed MAX_COLUMNS (8)", () => {
    expect(getGridColumns(5000, 20)).toBe(8);
  });

  it("should floor partial column fits", () => {
    expect(getGridColumns(500, 10)).toBe(1);
  });

  it("should return exact fit when width is a multiple of MIN_SERIES_WIDTH", () => {
    expect(getGridColumns(600, 10)).toBe(2);
  });
});
