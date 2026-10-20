import { c, t } from "ttag";

import { getStateName } from "../analyses/lifecycle";
import type { HabitSpec } from "../spec/types";
import {
  HABIT_INSIGHT_QUESTIONS,
  HABIT_WINDOW_WEEKS,
  getHabitWindowSize,
  habitInsightPopulation,
} from "../sql/analyses/habit-insights";

import { getRegularOutcome } from "./outcomes";
import type { EventInsightAttribute, InsightsAnalysis } from "./types";

/** What makes someone a regular, from the threshold the population found. */
const getOutcomeLabel = (habit: HabitSpec, threshold: number): string => {
  const isWholeWindow = threshold >= getHabitWindowSize(habit);
  switch (habit.subPeriod) {
    case "day":
      return isWholeWindow
        ? c("{0} is a number of weeks")
            .t`Active every day of the next ${HABIT_WINDOW_WEEKS} weeks`
        : c("{0} is a number of days, {1} is a number of weeks")
            .t`Active ${threshold}+ days in the next ${HABIT_WINDOW_WEEKS} weeks`;
    case "week":
      return isWholeWindow
        ? c("{0} is a number of weeks")
            .t`Active every week of the next ${HABIT_WINDOW_WEEKS}`
        : c("{0} and {1} are numbers of weeks")
            .t`Active in ${threshold}+ of the next ${HABIT_WINDOW_WEEKS} weeks`;
  }
};

const getQuestionName = (habit: HabitSpec, question: number): string => {
  if (question === HABIT_INSIGHT_QUESTIONS.new) {
    return getStateName("new");
  }
  return habit.hasFirstSeen ? t`Everyone else` : t`Everyone`;
};

/**
 * Insights into who becomes a regular over the next few weeks, by what they
 * did in a week: one question for people new that week, and one for everyone
 * else. People are compared with others as active as them that week.
 */
export const HABIT_INSIGHTS: InsightsAnalysis = {
  getOutcome: () => getRegularOutcome(),
  appliesTo: (spec) => spec.kind === "habit",
  attributeKind: "event",
  // A pair is better asked as a segment of its own.
  searchesPairs: false,
  getPopulation: (spec, attributes) =>
    habitInsightPopulation(
      spec,
      attributes.filter(
        (attribute): attribute is EventInsightAttribute =>
          attribute.kind === "event",
      ),
    ),
  getQuestions: (spec, totals, labels) => {
    const habit = spec.habit;
    if (habit === undefined) {
      return [];
    }
    return totals
      .flatMap(({ question, reached, converted }) => {
        const threshold = Number(labels.get(question));
        return Number.isInteger(threshold)
          ? [
              {
                question,
                labels: [
                  getQuestionName(habit, question),
                  getOutcomeLabel(habit, threshold),
                ],
                reached,
                converted,
              },
            ]
          : [];
      })
      .sort((a, b) => a.question - b.question);
  },
  // A person active in several weeks counts once for each.
  getCheckedCount: (questions) =>
    questions.reduce((total, { reached }) => total + reached, 0),
};
