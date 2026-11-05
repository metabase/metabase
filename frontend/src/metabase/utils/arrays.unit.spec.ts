import { times } from "./arrays";

describe("times", () => {
  it("returns the results of calling fn with each index", () => {
    expect(times(3, (index) => index * 2)).toEqual([0, 2, 4]);
  });

  it("returns an empty array for zero or negative counts", () => {
    const fn = jest.fn((index: number) => index);
    expect(times(0, fn)).toEqual([]);
    expect(times(-2, fn)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("throws for a fractional count, like underscore", () => {
    expect(() => times(1.5, (index) => index)).toThrow(RangeError);
  });
});
