import { createQuery, DEFAULT_QUERY } from "./test-helpers";
import * as ML from "./v2";

describe("query", () => {
  it("should create a query", () => {
    const query = createQuery();
    expect(ML.toLegacyQuery(query)).toEqual(DEFAULT_QUERY);
  });

  it("should suggest a name", () => {
    const query = createQuery();
    expect(ML.suggestedName(query)).toBe("Orders");
  });
});
