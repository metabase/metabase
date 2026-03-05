import { resolveCommonTabLabel } from "./tabs";

describe("resolveCommonTabLabel", () => {
  it("returns fallback for empty array", () => {
    expect(resolveCommonTabLabel([], "Time")).toBe("Time");
  });

  it("returns the name when only one is provided", () => {
    expect(resolveCommonTabLabel(["Created At"], "Time")).toBe("Created At");
  });

  it("returns the name when all names are identical", () => {
    expect(resolveCommonTabLabel(["Created At", "Created At"], "Time")).toBe(
      "Created At",
    );
  });

  it("returns the most frequent name", () => {
    expect(
      resolveCommonTabLabel(["Created At", "Order Date", "Created At"], "Time"),
    ).toBe("Created At");
  });

  it("returns the first name when tied", () => {
    expect(resolveCommonTabLabel(["State", "Category"], "Location")).toBe(
      "State",
    );
  });

  it("returns the first name when two different names are tied", () => {
    expect(resolveCommonTabLabel(["Created At", "Order Date"], "Time")).toBe(
      "Created At",
    );
  });
});
