import type { AnalysisSpec, PathsSpec } from "../../spec/types";

import { bounceInsightPopulation } from "./bounce-insights";
import { QUESTION_LABEL_COLUMN, planInsights } from "./insights";

const createSpec = (paths: Partial<PathsSpec> = {}): AnalysisSpec => ({
  kind: "paths",
  timeRange: { preset: "", tz: "UTC" },
  grain: "person",
  measure: { agg: "uniq" },
  bucket: { granularity: "week" },
  scope: { kind: "group", joiner: "and", negated: false, items: [] },
  paths: {
    direction: "from",
    start: null,
    end: null,
    steps: 5,
    included: [],
    sessionGapMinutes: 30,
    mergeRepeats: true,
    hideNoisyEvents: false,
    maxNodes: 8,
    minVolume: 5,
    ...paths,
  },
  output: {},
});

const AS_OF = new Map([["attr_1", "true-by-step" as const]]);

describe("bounceInsightPopulation", () => {
  it("is undefined unless the paths cover every visit from its first step", () => {
    const event = { flag: "ev_1" };

    expect(
      bounceInsightPopulation(createSpec({ start: event }), [], AS_OF),
    ).toBeUndefined();
    expect(
      bounceInsightPopulation(createSpec({ direction: "to" }), [], AS_OF),
    ).toBeUndefined();
  });

  it("asks about each landing page, with attributes as of landing", () => {
    const population = bounceInsightPopulation(
      createSpec(),
      ["attr_1", "attr_2"],
      AS_OF,
    );
    if (population === undefined) {
      throw new Error("Expected a population");
    }
    const landings = population.ctes.find(({ name }) => name === "landings");
    const visits = population.ctes.find(
      ({ name }) => name === population.source,
    );

    expect(population.hasLabels).toBe(true);
    expect(landings?.body).toContain("WHERE s.position = 1");
    expect(landings?.body).toContain("l.visit_length = 1 AS bounced");
    expect(visits?.body).toContain("l.bounced AS converted");
    expect(visits?.body).toContain(
      "if(l.attr_1_v != '', l.attr_1_v, 'false') AS attr_1",
    );
    expect(visits?.body).toContain(
      "if(l.attr_2_v != '', l.attr_2_v, '(not set)') AS attr_2",
    );
  });

  it("names each landing page in the singles query", () => {
    const population = bounceInsightPopulation(createSpec(), ["attr_1"], AS_OF);
    if (population === undefined) {
      throw new Error("Expected a population");
    }
    const plan = planInsights(population, {
      kind: "singles",
      attributes: ["attr_1"],
    });

    expect(plan.select).toContain(`any(label) AS ${QUESTION_LABEL_COLUMN}`);
    expect(plan.select).toContain("FROM landing_visits");
  });
});
