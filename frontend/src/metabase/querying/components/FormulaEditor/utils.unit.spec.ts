import { getDefaultFormulaName, isDefaultFormulaName } from "./utils";

describe("getDefaultFormulaName", () => {
  it("removes brackets and normalizes whitespace", () => {
    expect(getDefaultFormulaName("  [Total]  *  2  ")).toBe("Total * 2");
  });

  it("limits generated names to forty characters", () => {
    expect(
      getDefaultFormulaName(
        "[A long column name that exceeds forty characters] + 2",
      ),
    ).toBe("A long column name that exceeds forty c…");
  });
});

describe("isDefaultFormulaName", () => {
  it.each([
    ["Total * 2", "[Total] * 2", true],
    ["total*2", "[Total] * 2", true],
    [
      "datetimeAdd(Created At, 1, 'day')",
      'datetimeAdd([Created At], 1, "day")',
      true,
    ],
    ["Total + 10 (1)", "[Total] + 10", true],
    [
      "A long column name that exceeds forty c…",
      "[A long column name that exceeds forty characters] + 2",
      true,
    ],
    ["Revenue", "Sum([Total])", false],
  ])("tells whether %s is the default name of %s", (name, source, expected) => {
    expect(isDefaultFormulaName(name, source)).toBe(expected);
  });
});
