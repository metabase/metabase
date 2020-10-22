import { getName } from "metabase/lib/query/aggregation";

describe("getName", () => {
  it("should work with blank display name", () => {
    // we no longer allow this state, but some existing expressions are missing names
    expect(getName(["aggregation-options", ["+", ["count"], 3], null])).toEqual(
      undefined,
    );
  });
});
