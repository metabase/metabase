import type { AnalysisSpec, HabitSpec } from "../spec/types";

import { HABIT_INSIGHTS } from "./habit-analysis";
import type { GroupCounts } from "./types";

type SetupOpts = {
  subPeriod?: HabitSpec["subPeriod"];
  threshold: string;
};

const TOTALS: GroupCounts[] = [
  { question: 1, reached: 1000, converted: 210, conditions: [] },
];

const createSpec = ({
  subPeriod = "day",
}: Omit<SetupOpts, "threshold">): AnalysisSpec => ({
  kind: "habit",
  timeRange: { preset: "", tz: "UTC" },
  grain: "person",
  measure: { agg: "uniq" },
  bucket: { granularity: subPeriod },
  scope: { kind: "group", joiner: "and", negated: false, items: [] },
  habit: { subPeriod, measure: "histogram" },
  output: {},
});

const setup = ({ threshold, ...opts }: SetupOpts) =>
  HABIT_INSIGHTS.getQuestions(
    createSpec(opts),
    TOTALS,
    new Map([[1, threshold]]),
  );

describe("HABIT_INSIGHTS", () => {
  it("applies to habit, whatever it measures", () => {
    const spec = createSpec({});

    expect(HABIT_INSIGHTS.appliesTo(spec)).toBe(true);
    expect(
      HABIT_INSIGHTS.appliesTo({
        ...spec,
        habit: { subPeriod: "day", measure: "ratio" },
      }),
    ).toBe(true);
  });

  it("heads everyone by how many days make a regular", () => {
    const questions = setup({ threshold: "14" });

    expect(questions).toEqual([
      {
        question: 1,
        labels: ["Active 14+ days in the next 4 weeks"],
        reached: 1000,
        converted: 210,
      },
    ]);
    expect(HABIT_INSIGHTS.getCheckedCount(questions)).toBe(1000);
  });

  it("says when a regular is active in the whole window", () => {
    expect(setup({ threshold: "28" })[0].labels).toEqual([
      "Active every day of the next 4 weeks",
    ]);
    expect(setup({ subPeriod: "week", threshold: "3" })[0].labels).toEqual([
      "Active in 3+ of the next 4 weeks",
    ]);
    expect(setup({ subPeriod: "week", threshold: "4" })[0].labels).toEqual([
      "Active every week of the next 4",
    ]);
  });

  it("has no question without a threshold", () => {
    expect(
      HABIT_INSIGHTS.getQuestions(createSpec({}), TOTALS, new Map()),
    ).toEqual([]);
  });
});
