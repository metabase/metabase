import { getName, setName } from "metabase-lib/v1/queries/utils/aggregation";

describe("getName", () => {
  it("should work with blank display name", () => {
    // we no longer allow this state, but some existing expressions are missing names
    expect(getName(["aggregation-options", ["+", ["count"], 3], null])).toEqual(
      undefined,
    );
  });
});

describe("setName", () => {
  it("should set the name and display-name", () => {
    const expr = ["*", ["count"], 2];
    const aggregation = ["aggregation-options", ["*", ["count"], 2], null];
    expect(setName(aggregation, "DoubleCount")).toEqual([
      "aggregation-options",
      expr,
      { "display-name": "DoubleCount", name: "DoubleCount" },
    ]);
  });
});
