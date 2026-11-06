import { getDefaultFormulaName } from "./utils";

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
