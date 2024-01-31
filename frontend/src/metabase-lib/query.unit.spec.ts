import * as Lib from "metabase-lib";
import { createQuery, DEFAULT_QUERY } from "./test-helpers";

describe("query", () => {
  it("should create a query", () => {
    const query = createQuery();
    expect(Lib.toLegacyQuery(query)).toEqual(DEFAULT_QUERY);
  });

  it("should suggest a name", () => {
    const query = createQuery();
    expect(Lib.suggestedName(query)).toBe("Orders");
  });
});
