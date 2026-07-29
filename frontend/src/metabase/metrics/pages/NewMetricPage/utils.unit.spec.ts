import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";

import { ensureDefaultDimension } from "./utils";

describe("ensureDefaultDimension", () => {
  it("adds the preferred time breakout to a new metric query (UXW-4788)", () => {
    const query = Lib.aggregateByCount(
      Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
      0,
    );

    const nextQuery = ensureDefaultDimension(query);
    const [breakout] = Lib.breakouts(nextQuery, 0);
    const column = Lib.breakoutColumn(nextQuery, 0, breakout);

    expect(column).not.toBeNull();
    if (!column) {
      return;
    }
    expect(Lib.displayInfo(nextQuery, 0, column).displayName).toBe(
      "Created At",
    );
    expect(Lib.defaultDisplay(nextQuery).display).toBe("line");
  });

  it("preserves an explicitly selected breakout", () => {
    const query = Lib.aggregateByCount(
      Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
      0,
    );
    const total = Lib.breakoutableColumns(query, 0).find(
      (column) => Lib.displayInfo(query, 0, column).displayName === "Total",
    );

    expect(total).toBeDefined();
    if (!total) {
      return;
    }
    const queryWithBreakout = Lib.breakout(query, 0, total);

    expect(ensureDefaultDimension(queryWithBreakout)).toBe(queryWithBreakout);
  });
});
