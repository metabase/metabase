import type { AnalysisSpec } from "../spec/types";

import { BOUNCE_INSIGHTS } from "./bounce-analysis";

const createSpec = (start: { flag: string } | null): AnalysisSpec => ({
  kind: "paths",
  timeRange: { preset: "", tz: "UTC" },
  grain: "person",
  measure: { agg: "uniq" },
  bucket: { granularity: "week" },
  scope: { kind: "group", joiner: "and", negated: false, items: [] },
  paths: {
    direction: "from",
    start,
    end: null,
    steps: 5,
    included: [],
    sessionGapMinutes: 30,
    mergeRepeats: true,
    hideNoisyEvents: false,
    maxNodes: 8,
    minVolume: 5,
  },
  output: {},
});

describe("BOUNCE_INSIGHTS", () => {
  it("applies to paths from the start of a visit", () => {
    expect(BOUNCE_INSIGHTS.appliesTo(createSpec(null))).toBe(true);
    expect(BOUNCE_INSIGHTS.appliesTo(createSpec({ flag: "ev_1" }))).toBe(false);
  });

  it("heads each question with its landing page, most common first", () => {
    const questions = BOUNCE_INSIGHTS.getQuestions(
      createSpec(null),
      [
        { question: 2, reached: 40, converted: 4, conditions: [] },
        { question: 1, reached: 100, converted: 20, conditions: [] },
        { question: 3, reached: 10, converted: 1, conditions: [] },
      ],
      new Map([
        [1, "/pricing"],
        [2, "/"],
      ]),
    );

    expect(questions).toEqual([
      {
        question: 1,
        labels: ["Landing page /pricing"],
        reached: 100,
        converted: 20,
      },
      {
        question: 2,
        labels: ["Landing page /"],
        reached: 40,
        converted: 4,
      },
    ]);
    expect(BOUNCE_INSIGHTS.getCheckedCount(questions)).toBe(140);
  });
});
