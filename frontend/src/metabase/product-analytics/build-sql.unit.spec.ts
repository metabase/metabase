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
    expect(built.sql).toContain("windowFunnel");
    expect(built.sql).toContain("Viewed pricing");
    expect(built.ctes[0]?.name).toBe("events_base");
  });

  it("projects the extra columns a planner reads", () => {
    const built = buildSql(getFunnelSpec(), "SELECT 1", {
      columns: BASE_COLUMNS,
      flags: ["ev_1", "ev_2", "ev_3"],
      extraColumns: [{ as: "cohort_attribute", alias: "Users__plan" }],
    });

    expect(built.sql).toContain("`Users__plan` AS cohort_attribute");
  });

  describe("cohorts", () => {
    const returning = createMockEventDefinition({ name: "Came back" });

    it("places people by the earliest start date", () => {
      const spec = getSpec("cohorts", {
        "cohorts.start_column": "signed_up_at",
        "cohorts.return": returning,
      });
      const built = buildSql(spec, "SELECT 1", {
        columns: BASE_COLUMNS,
        flags: ["ev_1"],
        extraColumns: [{ as: "cohort_start", alias: "signed_up_at" }],
      });

      expect(built.sql).toContain("`signed_up_at` AS cohort_start");
      expect(built.sql).toContain(
        "toStartOfWeek(min(cohort_start), 1) AS cohort",
      );
    });

    it("places people by their latest attribute value", () => {
      const spec = getSpec("cohorts", {
        "cohorts.by": "attribute",
        "cohorts.attribute": "plan",
        "cohorts.return": returning,
        granularity: "month",
      });
      const built = buildSql(spec, "SELECT 1", {
        columns: BASE_COLUMNS,
        flags: ["ev_1"],
        extraColumns: [{ as: "cohort_attribute", alias: "plan" }],
      });

      expect(built.sql).toContain("argMax(cohort_attribute, ts) AS cohort");
      expect(built.sql).toContain("toStartOfMonth(min(ts)) AS started");
    });
  });
});
