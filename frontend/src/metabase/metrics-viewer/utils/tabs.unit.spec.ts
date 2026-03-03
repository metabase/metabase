import { findMostSpecificCommonLabel } from "./tabs";

describe("findMostSpecificCommonLabel", () => {
  it("returns fallback for empty array", () => {
    expect(findMostSpecificCommonLabel([], "Time")).toBe("Time");
  });

  it("returns the name when only one is provided", () => {
    expect(findMostSpecificCommonLabel(["Created At"], "Time")).toBe(
      "Created At",
    );
  });

  it("returns the name when all names are identical", () => {
    expect(
      findMostSpecificCommonLabel(["Created At", "Created At"], "Time"),
    ).toBe("Created At");
  });

  it("returns the longest common word run", () => {
    expect(
      findMostSpecificCommonLabel(
        ["Customer State", "Order State"],
        "Location",
      ),
    ).toBe("State");
  });

  it("returns multi-word common run", () => {
    expect(
      findMostSpecificCommonLabel(
        ["Customer Created At", "Order Created At"],
        "Time",
      ),
    ).toBe("Created At");
  });

  it("returns fallback when no words are shared", () => {
    expect(findMostSpecificCommonLabel(["State", "Category"], "Location")).toBe(
      "Location",
    );
  });

  it("works with three or more names", () => {
    expect(
      findMostSpecificCommonLabel(
        ["Customer State", "Order State", "Vendor State"],
        "Location",
      ),
    ).toBe("State");
  });

  it("returns fallback when no common run exists across all names", () => {
    expect(
      findMostSpecificCommonLabel(
        ["Created At", "Customer State", "Product Category"],
        "Dimension",
      ),
    ).toBe("Dimension");
  });
});
