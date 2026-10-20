import type { AnalysisSpec, HabitSpec } from "../spec/types";

import { HABIT_INSIGHTS } from "./habit-analysis";
import type { GroupCounts } from "./types";

type SetupOpts = {
  subPeriod?: HabitSpec["subPeriod"];
  hasFirstSeen?: boolean;
  threshold: string;
};

const TOTALS: GroupCounts[] = [
  { question: 2, reached: 900, converted: 180, conditions: [] },
  { question: 1, reached: 100, converted: 30, conditions: [] },
];

const createSpec = ({
  subPeriod = "day",
  hasFirstSeen = true,
}: Omit<SetupOpts, "threshold">): AnalysisSpec => ({
  kind: "habit",
  timeRange: { preset: "", tz: "UTC" },
  grain: "person",
  measure: { agg: "uniq" },
  bucket: { granularity: subPeriod },
  scope: { kind: "group", joiner: "and", negated: false, items: [] },
  habit: { subPeriod, measure: "histogram", hasFirstSeen },
  output: {},
});

const setup = ({ threshold, ...opts }: SetupOpts) =>
  HABIT_INSIGHTS.getQuestions(
    createSpec(opts),
    TOTALS,
    new Map([
      [1, threshold],
      [2, threshold],
    ]),
  );

describe("HABIT_INSIGHTS", () => {
  it("applies to habit, whatever it measures", () => {
    const spec = createSpec({});

    expect(HABIT_INSIGHTS.appliesTo(spec)).toBe(true);
    expect(
      HABIT_INSIGHTS.appliesTo({
        ...spec,
        habit: { subPeriod: "day", measure: "ratio", hasFirstSeen: true },
      }),
    ).toBe(true);
  });

  it("heads new people first, then everyone else, with how many days make a regular", () => {
    const questions = setup({ threshold: "14" });

    expect(questions).toEqual([
      {
        question: 1,
        labels: ["New", "Active 14+ days in the next 4 weeks"],
        reached: 100,
        converted: 30,
      },
      {
        question: 2,
        labels: ["Everyone else", "Active 14+ days in the next 4 weeks"],
        reached: 900,
        converted: 180,
      },
    ]);
    expect(HABIT_INSIGHTS.getCheckedCount(questions)).toBe(1000);
  });

  it("says when a regular is active in the whole window", () => {
    expect(setup({ threshold: "28" })[0].labels[1]).toBe(
      "Active every day of the next 4 weeks",
    );
    expect(setup({ subPeriod: "week", threshold: "3" })[0].labels[1]).toBe(
      "Active in 3+ of the next 4 weeks",
    );
    expect(setup({ subPeriod: "week", threshold: "4" })[0].labels[1]).toBe(
      "Active every week of the next 4",
    );
  });

  it("calls everyone everyone without knowing when people were first seen", () => {
    const questions = HABIT_INSIGHTS.getQuestions(
      createSpec({ hasFirstSeen: false }),
      [TOTALS[0]],
      new Map([[2, "14"]]),
    );

    expect(questions.map(({ labels }) => labels[0])).toEqual(["Everyone"]);
  });
});
