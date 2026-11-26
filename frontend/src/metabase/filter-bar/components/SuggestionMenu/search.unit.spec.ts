import { findExact, isMatch } from "./search";

describe("isMatch", () => {
  it.each<[string, string, boolean]>([
    ["Created At", "created at", true],
    ["Created At", " eat", true],
    ["Created At", "", true],
    ["Created At", "total", false],
  ])("matches %j by %j: %s", (text, query, result) => {
    expect(isMatch(text, query)).toBe(result);
  });
});

describe("findExact", () => {
  const label = (text: string) => text;

  it("finds the item whose label is the query", () => {
    expect(findExact(["ID", "Total"], label, " total ")).toBe("Total");
  });

  it("finds nothing when the query starts another label too", () => {
    expect(findExact(["Created", "Created At"], label, "created")).toBeNull();
  });

  it("finds nothing when two items have the label", () => {
    expect(findExact(["Created At", "Created At"], label, "created at")).toBe(
      null,
    );
  });

  it("finds nothing for an empty query", () => {
    expect(findExact(["ID"], label, " ")).toBeNull();
  });
});
