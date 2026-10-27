import { getAnalysisConfig } from "./analyses/config";
import { buildSql } from "./build-sql";
import { createFlagAllocator } from "./events/allocate-flags";
import { createMockEventDefinition } from "./events/mocks";
import { computeSettings } from "./settings/compute";
import type { StoredSettings } from "./settings/types";
import type { AnalysisKind } from "./spec/types";

const getSpec = (kind: AnalysisKind, stored: StoredSettings) => {
  const config = getAnalysisConfig(kind);
  const computed = computeSettings(
    config.settings,
    { table: undefined, usersTable: undefined },
    stored,
  );
  const result = config.toSpec(computed, createFlagAllocator());
  if (result.status !== "ready") {
    throw new Error(`The ${kind} settings should be ready to run`);
  }
  return result.spec;
};

const getFunnelSpec = () =>
  getSpec("funnel", {
    "funnel.steps": ["Viewed pricing", "Started trial", "Purchased"].map(
      (name) => createMockEventDefinition({ name }),
    ),
  });

const BASE_COLUMNS = {
  timestamp: "ts",
  person: "user_id",
  session: null,
  event_id: "id",
  event_name: "event_name",
  url_path: null,
};

describe("buildSql", () => {
  it("wraps compiled base SQL as events_base and plans a funnel", () => {
    const built = buildSql(
      getFunnelSpec(),
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
        extraColumns: [],
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
    expect(built.sql).toContain("funnel_runs AS");
    expect(built.sql).toContain("Viewed pricing");
    expect(built.ctes[0]?.name).toBe("events_base");
  });

  it("projects the extra columns a planner reads", () => {
    const built = buildSql(getFunnelSpec(), "SELECT 1", {
      columns: BASE_COLUMNS,
      flags: ["ev_1", "ev_2", "ev_3"],
      extraColumns: [{ as: "breakout_property", alias: "Users__plan" }],
    });

    expect(built.sql).toContain("`Users__plan` AS breakout_property");
  });

  describe("cohorts", () => {
    const starting = createMockEventDefinition({ name: "Signed up" });
    const returning = createMockEventDefinition({ name: "Came back" });

    const getCohortsSql = (stored: StoredSettings) => {
      const spec = getSpec("cohorts", {
        "cohorts.start": starting,
        "cohorts.return": returning,
        ...stored,
      });
      return buildSql(spec, "SELECT 1", {
        columns: BASE_COLUMNS,
        flags: ["ev_1", "ev_2"],
        extraColumns: [{ as: "breakout_property", alias: "plan" }],
      }).sql;
    };

    it("places people in the period they first did the starting event", () => {
      const sql = getCohortsSql({});

      expect(sql).toContain("minIf(ts, is_start) AS start_ts");
      expect(sql).toContain("toStartOfWeek(start_ts, 1) AS cohort");
      expect(sql).toContain("addWeeks(cohort, offset) AS date");
    });

    it("places people by the first value on their start events", () => {
      const sql = getCohortsSql({
        breakout: { type: "property", column: "plan" },
        granularity: "month",
      });

      expect(sql).toContain(
        "argMinIf(breakout_value, ts, breakout_value != '' AND (is_start)) AS breakout",
      );
      expect(sql).toContain("breakout AS cohort");
      expect(sql).toContain("toStartOfMonth(start_ts) AS started");
    });

    it("only counts the people who have reached a period", () => {
      const sql = getCohortsSql({});

      expect(sql).toContain(
        "ARRAY JOIN range(toUInt32(greatest(observable + 1, 0))) AS offset",
      );
      expect(sql).toContain(
        "uniqExactIf(actor, has(came_back, offset)) / nullIf(uniqExact(actor), 0)",
      );
    });

    it("pools every cohort for the average", () => {
      const sql = getCohortsSql({
        "cohorts.view": "curves",
        "cohorts.lines": "average",
      });

      expect(sql).toMatch(/GROUP BY offset\n/);
      expect(sql).not.toContain("AS date");
    });
  });
});
