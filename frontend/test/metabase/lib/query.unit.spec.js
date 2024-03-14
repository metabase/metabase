import * as Q_DEPRECATED from "metabase-lib/v1/queries/utils";

describe("isValidField", () => {
  it("should return true for new-style fk", () => {
    expect(Q_DEPRECATED.isValidField(["field", 2, { "source-field": 1 }])).toBe(
      true,
    );
  });
});
