import { breakout, orderBy } from "./query-helpers";

const categoryField = {
  type: "column" as const,
  name: "category",
  tableId: 1,
};

describe("serializable query helpers", () => {
  it.each([
    ["breakout", breakout(categoryField)],
    ["orderBy", orderBy(categoryField, "asc")],
  ])("omits an unused unit from %s", (_name, clause) => {
    expect(clause).not.toHaveProperty("unit");
    expect(JSON.stringify(clause)).not.toContain("unit");
  });
});
