import { defineQuery } from "./define-query";

describe("defineQuery", () => {
  it("returns the query definition unchanged", () => {
    const query = {
      source: { type: "card", entityId: "revenueQuestionEntity" },
      enabled: false,
    } as const;

    expect(defineQuery(query)).toBe(query);
  });
});
