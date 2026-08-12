import * as Lib from "metabase-lib";

import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "./test-helpers";

describe("expressionParts", () => {
  it("preserves literal expression values", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const clause = Lib.expressionClause("literal value");

    expect(Lib.expressionParts(query, -1, clause)).toBe("literal value");
  });
});
