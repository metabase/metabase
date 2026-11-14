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
    ["Total*2", "[Total] * 2"],
    ["sum(total)", "Sum([Total])"],
    ["concat(Name, ' !')", 'concat([Name], " !")'],
    [
      "A long column name that exceeds forty c…",
      "[A long column name that exceeds forty characters] + 2",
    ],
  ])("matches %s with the formula it was typed as", (name, source) => {
    expect(isDefaultFormulaName(name, source)).toBe(true);
  });

  it.each([
    ["Doubled total", "[Total] * 2"],
    ["Total*2", "[Total] * 3"],
    ["…", "[Total] * 2"],
  ])("does not match %s with %s", (name, source) => {
    expect(isDefaultFormulaName(name, source)).toBe(false);
  });
});
