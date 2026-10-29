import { getPickerColorAlias, getRingColorAlias } from "./colors";

describe("getRingColorAlias", () => {
  it("should return the correct color alias for inner ring", () => {
    expect(getRingColorAlias("1", "inner")).toBe("accent1-dark");
    expect(getRingColorAlias("gray", "inner")).toBe("accent-gray-dark");
  });

  it("should return the correct color alias for middle ring", () => {
    expect(getRingColorAlias("1", "middle")).toBe("accent1");
    expect(getRingColorAlias("gray", "middle")).toBe("accent-gray");
  });

  it("should return the correct color alias for outer ring", () => {
    expect(getRingColorAlias("1", "outer")).toBe("accent1-light");
    expect(getRingColorAlias("gray", "outer")).toBe("accent-gray-light");
  });
});

describe("getPickerColorAlias", () => {
  it("should return the correct color alias for numeric accent keys", () => {
    expect(getPickerColorAlias("1")).toBe("accent1-dark");
    expect(getPickerColorAlias("10")).toBe("accent10-dark");
  });

  it("should return the correct color alias for non-numeric accent keys", () => {
    expect(getPickerColorAlias("gray")).toBe("accent-gray-dark");
    expect(getPickerColorAlias("something")).toBe("accent-something-dark");
  });
});
