import { describe, expect, it } from "bun:test";

import { buildOnlySelector } from "./collect-failed-backend.ts";
import type { NormalizedTest } from "./contract.ts";

const failure = (path: string | null | undefined, name: string): NormalizedTest => ({
  name,
  path,
  status: "failure",
});

describe("buildOnlySelector", () => {
  it("builds a sorted, deduped `:only` vector of ns/var symbols", () => {
    const vector = buildOnlySelector([
      failure("metabase.b-test", "beta-test"),
      failure("metabase.a-test", "alpha-test"),
      failure("metabase.b-test", "beta-test"), // dup
    ]);
    expect(vector).toBe("[metabase.a-test/alpha-test metabase.b-test/beta-test]");
  });

  it("keeps thread-arrow test names intact", () => {
    const vector = buildOnlySelector([
      failure("metabase.util.cron-test", "cron-string->schedule-map-test"),
    ]);
    expect(vector).toBe("[metabase.util.cron-test/cron-string->schedule-map-test]");
  });

  it("returns null (full rerun) when there are no failures", () => {
    expect(buildOnlySelector([])).toBeNull();
  });

  it("returns null (full rerun) when any failure has no namespace", () => {
    expect(
      buildOnlySelector([
        failure("metabase.a-test", "alpha-test"),
        failure("", "orphan-test"),
      ]),
    ).toBeNull();
    expect(buildOnlySelector([failure(null, "orphan-test")])).toBeNull();
  });
});
