import { isSameEntity } from "./utils";

describe("isSameEntity", () => {
  it("returns true for same id and type", () => {
    expect(
      isSameEntity({ id: 1, type: "table" }, { id: 1, type: "table" }),
    ).toBe(true);
  });

  it("returns false for different id", () => {
    expect(
      isSameEntity({ id: 1, type: "table" }, { id: 2, type: "table" }),
    ).toBe(false);
  });

  it("returns false for different type", () => {
    expect(
      isSameEntity({ id: 1, type: "table" }, { id: 1, type: "card" }),
    ).toBe(false);
  });
});
