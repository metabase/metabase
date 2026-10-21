import type { BaseQueryInput } from "../base-query";
import { createMockEventDefinition } from "../events/mocks";
import { NO_FILTERS } from "../filters";
import type { AnalysisSpec, CohortsSpec, Granularity } from "../spec/types";
import { planInsights } from "../sql/analyses/insights";

import { COHORTS_INSIGHTS } from "./cohorts-analysis";
import type { GroupCounts, InsightAttribute } from "./types";

type SetupOpts = {
  granularity?: Granularity;
  horizon?: number;
  returnRule?: CohortsSpec["returnRule"];
};

const createSpec = ({
  granularity = "week",
  horizon = 13,
  returnRule = "exactly",
}: SetupOpts = {}): AnalysisSpec => ({
  kind: "cohorts",
  timeRange: { preset: "", tz: "UTC" },
  grain: "person",
  measure: { agg: "uniq" },
  bucket: { granularity },
  scope: { kind: "group", joiner: "and", negated: false, items: [] },
  cohorts: { by: "startDate", returnRule, horizon },
  output: {},
});

const totals = (questions: number[]): GroupCounts[] =>
  questions.map((question) => ({
    question,
    reached: 1000 - question * 100,
    converted: 400,
    conditions: [],
  }));

const ATTRIBUTES: InsightAttribute[] = [
  {
    kind: "column",
    id: "attr_1",
    column: "browser",
    from: "events",
    displayName: "Browser",
    asOf: "first-seen",
  },
  {
    kind: "event",
    id: "attr_2",
    flag: "seg_1",
    event: createMockEventDefinition({ name: "Sent an invite" }),
    displayName: "Sent an invite",
    minCount: 1,
  },
];

const createBase = (
  extraColumns: BaseQueryInput["extraColumns"],
): BaseQueryInput => ({
  dateRange: "past90days",
  columns: {
    timestamp: "created_at",
    person: "person_id",
    session: null,
    event_id: "event_id",
    event_name: "event_name",
    url_path: null,
  },
  events: [],
  extraColumns,
  usersTable: undefined,
  filters: NO_FILTERS,
  lookbackDays: 0,
});

describe("COHORTS_INSIGHTS", () => {
  it("compares people by their properties and what they did", () => {
    expect(COHORTS_INSIGHTS.attributeKinds).toEqual(["column", "event"]);
  });

  it("heads the usual checkpoints the cohorts are followed for", () => {
    const questions = COHORTS_INSIGHTS.getQuestions(
      createSpec(),
      totals([1, 2, 3]),
      new Map(),
    );

    expect(questions.map(({ labels }) => labels)).toEqual([
      ["Came back in week 1"],
      ["Came back in week 4"],
    ]);
    expect(COHORTS_INSIGHTS.getCheckedCount(questions)).toBe(900);
  });

  it("follows the granularity and the return rule", () => {
    const questions = COHORTS_INSIGHTS.getQuestions(
      createSpec({ granularity: "month", returnRule: "onOrAfter" }),
      totals([1, 2, 3]),
      new Map(),
    );

    expect(questions.map(({ labels }) => labels)).toEqual([
      ["Came back in month 1 or later"],
      ["Came back in month 3 or later"],
      ["Came back in month 6 or later"],
    ]);
  });

  it("doesn't apply until the cohorts are followed past the start", () => {
    expect(COHORTS_INSIGHTS.appliesTo(createSpec({ horizon: 1 }))).toBe(false);
    expect(COHORTS_INSIGHTS.appliesTo(createSpec({ horizon: 2 }))).toBe(true);
  });

  it("focuses on the event table column the cohorts are grouped by", () => {
    const getFocusColumn = COHORTS_INSIGHTS.getFocusColumn;

    expect(
      getFocusColumn?.(
        createBase([
          { as: "cohort_attribute", column: "browser", from: "events" },
        ]),
      ),
    ).toBe("browser");
    // The users table holds current traits, which would leak later states.
    expect(
      getFocusColumn?.(
        createBase([{ as: "cohort_attribute", column: "plan", from: "users" }]),
      ),
    ).toBeUndefined();
  });

  it("counts properties as of the start and events in the start period, against people as active", () => {
    const population = COHORTS_INSIGHTS.getPopulation(createSpec(), ATTRIBUTES);
    if (population === undefined) {
      throw new Error("Expected a population");
    }
    const sql = planInsights(population, {
      kind: "singles",
      attributes: ["attr_1", "attr_2"],
    })
      .ctes.map(({ body }) => body)
      .join("\n");

    expect(population.hasExpected).toBe(true);
    expect(sql).toContain("any(s.attr_1_seen) <= any(s.start_ts)");
    expect(sql).toContain(
      "countIf(e.seg_1_hit = 1 AND e.ts >= s.start_ts AND toStartOfWeek(e.ts, 1) = toStartOfWeek(s.start_ts, 1)) AS seg_1_count",
    );
    expect(sql).toContain(
      "ARRAY JOIN [1, 4] AS offset, arrayEnumerate([1, 4]) AS k",
    );
    expect(sql).toContain("WHERE reached >= offset");
    expect(sql).toContain("has(came_back, offset) AS converted");
    expect(sql).toContain(
      "avg(converted) OVER (PARTITION BY k, active_units, active_events_scale) AS expected",
    );
  });
});
