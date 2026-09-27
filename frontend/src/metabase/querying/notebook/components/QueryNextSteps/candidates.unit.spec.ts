import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
} from "metabase-lib/query/test-helpers";

import { localCandidates } from "./candidates";

describe("query next-step candidates", () => {
  it("creates executable aggregation and custom-column edges without changing the starting query", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const before = Lib.toJsQuery(query);
    const candidates = localCandidates(query);
    expect(candidates.some((c) => c.kind === "aggregation")).toBe(true);
    expect(candidates.some((c) => c.kind === "custom column")).toBe(true);
    for (const candidate of candidates) {
      const next = await candidate.apply();
      expect(Lib.toJsQuery(next)).not.toEqual(before);
      expect(Lib.aggregations(next, -1)).toHaveLength(
        candidate.kind === "aggregation" ? 1 : 0,
      );
      expect(Lib.expressions(next, -1)).toHaveLength(
        candidate.kind === "custom column" ? 1 : 0,
      );
    }
    expect(Lib.toJsQuery(query)).toEqual(before);
  });

  it("summarizes existing results in a new stage, preserving the existing aggregation", async () => {
    const query = Lib.aggregateByCount(
      Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
      -1,
    );
    const candidate = localCandidates(query).find(
      (c) => c.kind === "aggregation",
    );
    expect(candidate).toBeDefined();
    const next = await candidate!.apply();
    expect(Lib.stageCount(next)).toBe(2);
    expect(Lib.aggregations(next, 0)).toHaveLength(1);
    expect(Lib.aggregations(next, 1)).toHaveLength(1);
  });
});
