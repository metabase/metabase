import { getHighlightedRanges } from "./utils";

describe("getHighlightedRanges", () => {
  it("returns an empty array if no highlighted text is provided", () => {
    expect(getHighlightedRanges("const foo = 'bar'")).toEqual([]);
    expect(getHighlightedRanges("const foo = 'bar'", [])).toEqual([]);
  });

  it("returns all the ranges of the highlighted text in the source code", () => {
    expect(getHighlightedRanges("const foo = 'foobar'", ["foo"])).toEqual([
      { start: 6, end: 9 },
      { start: 13, end: 16 },
    ]);
  });
});
