import type { ExtraColumn } from "../columns";
import type { EventDefinition } from "../events/types";
import type { AnalysisSpec } from "../spec/types";
import type {
  AttributeAsOf,
  InsightPopulation,
} from "../sql/analyses/insights";

import type { InsightOutcome } from "./outcomes";

/** A table column the search splits actors by. */
export type ColumnInsightAttribute = Omit<ExtraColumn, "as"> & {
  kind: "column";
  /** The column's name on `events_base`. */
  id: string;
  displayName: string;
  /** The column's description in Metabase, if it has one. */
  description?: string;
  /** How its value is taken as of each question's moment. */
  asOf: AttributeAsOf;
};

/**
 * Whether an actor did an event at least `minCount` times, from a segment on
 * the event table. Its values are `"true"` and `"false"`.
 */
export type EventInsightAttribute = {
  kind: "event";
  /** The attribute's column in the population. */
  id: string;
  /** The event's flag column on `events_base`. */
  flag: string;
  event: EventDefinition;
  /** The segment's name. */
  displayName: string;
  /** The segment's description in Metabase, if it has one. */
  description?: string;
  minCount: number;
};

export type InsightAttribute = ColumnInsightAttribute | EventInsightAttribute;

/** The insight attributes an analysis compares actors by. */
export type InsightAttributeKind = InsightAttribute["kind"];

export type InsightCondition = {
  attributeId: string;
  value: string;
};

/** The outcomes expected of a group, given what else is known about each actor. */
export type ExpectedOutcomes = {
  /** The sum of each actor's chance of the outcome. */
  outcomes: number;
  /** The sum of each actor's p × (1 − p). */
  variance: number;
};

export type Counts = {
  reached: number;
  converted: number;
  /** Set when the population has an expected chance for each actor. */
  expected?: ExpectedOutcomes;
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
  /**
   * The outcome rate of everyone else at the question, or with expected
   * outcomes, the rate expected of the group.
   */
  restRate: number;
  /** Outcomes above (or, when negative, below) what the group would have at `restRate`. */
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
  getOutcome: (spec: AnalysisSpec) => InsightOutcome;
  /** Whether the spec has insights to look for. */
  appliesTo: (spec: AnalysisSpec) => boolean;
  /**
   * What actors are compared by: table columns, or how many times they did
   * each of the event table's segments.
   */
  attributeKind: InsightAttributeKind;
  /**
   * Whether to look for pairs of attributes too. Their interaction test
   * compares raw rates, so it doesn't fit populations with expected outcomes.
   */
  searchesPairs: boolean;
  getPopulation: (
    spec: AnalysisSpec,
    attributes: readonly InsightAttribute[],
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
