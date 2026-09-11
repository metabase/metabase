import { defineQuery } from "./define-query";

describe("defineQuery", () => {
  it("returns the query definition unchanged", () => {
    const query = {
      savedQuestionSourceId: 54,
      source: { type: "table", id: 1 },
      limit: 10,
    } as const;

    expect(defineQuery(query)).toBe(query);
  });
});
