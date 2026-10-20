import type { ExtraColumn } from "../columns";
import type { AnalysisSpec } from "../spec/types";
import type {
  AttributeAsOf,
  AttributeAsOfRules,
  InsightPopulation,
} from "../sql/analyses/insights";

import type { InsightOutcome } from "./outcomes";

/** A table column the search splits actors by. */
export type InsightAttribute = Omit<ExtraColumn, "as"> & {
  /** The column's name on `events_base`. */
  id: string;
  displayName: string;
  /** The column's description in Metabase, if it has one. */
  description?: string;
  /** How its value is taken as of each question's moment. */
  asOf: AttributeAsOf;
};

export type InsightCondition = {
  attributeId: string;
  value: string;
};

export type Counts = {
  reached: number;
  converted: number;
};

/**
 * Counts for the actors who meet `conditions` at one question. No conditions
 * means everyone. `converted` counts the actors who had the outcome, like
 * converting at a funnel step or bouncing from a landing page.
 */
export type GroupCounts = Counts & {
  /** The question's number, from 1, like a funnel transition or a landing page. */
  question: number;
  conditions: InsightCondition[];
};

export type Insight = GroupCounts & {
  rate: number;
  /** The outcome rate of everyone else at the question. */
  restRate: number;
  /** Outcomes above (or, when negative, below) what the group would have at everyone else's rate. */
  excess: number;
  pValue: number;
};

/** A question's heading in the insights panel, with its totals. */
export type InsightQuestion = Counts & {
  question: number;
  /** Above the title, like "Step 1 → 2" or "Landing page". */
  caption: string;
  /** The title's parts, shown with arrows between them. */
  labels: string[];
};

/** How an analysis asks for insights. */
export type InsightsAnalysis = {
  getOutcome: () => InsightOutcome;
  /** Whether the spec has insights to look for. */
  appliesTo: (spec: AnalysisSpec) => boolean;
  getPopulation: (
    spec: AnalysisSpec,
    attributes: readonly string[],
    asOf: AttributeAsOfRules,
  ) => InsightPopulation | undefined;
  /**
   * Each question's heading, from its totals and, when the population has
   * them, its label.
   */
  getQuestions: (
    spec: AnalysisSpec,
    totals: readonly GroupCounts[],
    labels: ReadonlyMap<number, string>,
  ) => InsightQuestion[];
  /** How many actors the search looked at, to say so when nothing stands out. */
  getCheckedCount: (questions: readonly InsightQuestion[]) => number;
};
