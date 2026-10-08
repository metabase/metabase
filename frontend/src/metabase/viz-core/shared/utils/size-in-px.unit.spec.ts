import { getSizeInPx } from "./size-in-px";

describe("getSizeInPx", () => {
  it("returns the number value if it's not a string", () => {
    expect(getSizeInPx(12)).toBe(12);
  });

  it("returns the px units as a number", () => {
    expect(getSizeInPx("14px")).toBe(14);
    expect(getSizeInPx("8.256px")).toBe(8.256);
  });

  it("converts em/rem units based on parent font size", () => {
    expect(getSizeInPx("0.75em")).toBe(12);
    expect(getSizeInPx("0.75rem", 14)).toBe(10.5);
    expect(getSizeInPx("1.56em", 18)).toBe(28.08);
  });

  it("returns undefined if the value cannot be parsed", () => {
    expect(getSizeInPx("15%")).toBe(undefined);
    expect(getSizeInPx("22")).toBe(undefined);
    expect(getSizeInPx("foobar")).toBe(undefined);
  });
});
