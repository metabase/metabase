import { getAnalysisConfig } from "./analyses/config";
import type { AnalysisContext } from "./analyses/types";
import { buildSql } from "./build-sql";
import { allocateFlags } from "./events/allocate-flags";
import { SAVED_EVENTS } from "./events/catalog";
import { computeSettings } from "./settings/compute";

const getDefaultFunnelSpec = () => {
  const config = getAnalysisConfig("funnel");
  const context: AnalysisContext = {
    table: undefined,
    savedEvents: SAVED_EVENTS,
  };
  const computed = computeSettings(config.settings, context, {});
  const eventIds = config.getEventRefs(computed).map(({ id }) => id);
  return config.toSpec(computed, allocateFlags(eventIds, SAVED_EVENTS));
};

describe("buildSql", () => {
  it("wraps compiled base SQL as events_base and plans a funnel", () => {
    const built = buildSql(
      getDefaultFunnelSpec(),
      "SELECT person_id, created_at, ev_1, ev_2, ev_3 FROM events;",
      {
        columns: {
          timestamp: "ts",
          person: "user_id",
          session: null,
          event_id: "id",
          event_name: "event_name",
          url_path: null,
        },
        flags: ["ev_1", "ev_2", "ev_3"],
      },
    );

    expect(built.sql).toContain("WITH events_base AS");
    expect(built.sql).toContain("`ts` AS created_at");
    expect(built.sql).toContain("`user_id` AS person_id");
    expect(built.sql).toContain("NULL AS session_id");
    expect(built.sql).toContain("'' AS url_path");
    expect(built.sql).toMatch(
      /FROM \(\s+SELECT person_id, created_at, ev_1, ev_2, ev_3 FROM events\s+\) AS base/,
    );
    expect(built.sql).toContain("windowFunnel");
    expect(built.sql).toContain("Viewed pricing");
    expect(built.ctes[0]?.name).toBe("events_base");
  });
});
