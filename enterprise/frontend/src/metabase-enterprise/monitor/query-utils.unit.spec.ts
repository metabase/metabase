import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";

import { applyIdFilter } from "./query-utils";

describe("applyIdFilter", () => {
  const baseQuery = () =>
    Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);

  it("is a no-op when id is undefined", () => {
    const q = baseQuery();
    const result = applyIdFilter(q, "user_id", undefined);
    expect(Lib.filters(result, 0)).toHaveLength(0);
  });

  it("adds an equality filter on the named column when present (Orders.USER_ID matches case-insensitively)", () => {
    const q = baseQuery();
    const result = applyIdFilter(q, "user_id", 42);
    const [clause, ...rest] = Lib.filters(result, 0);
    expect(rest).toHaveLength(0);
    const parts = Lib.numberFilterParts(result, 0, clause);
    expect(parts?.operator).toBe("=");
    expect(parts?.values).toEqual([42]);
  });

  it("is a no-op when the column cannot be found on the query", () => {
    const q = baseQuery();
    const result = applyIdFilter(q, "column_that_does_not_exist", 42);
    expect(Lib.filters(result, 0)).toHaveLength(0);
  });
});
