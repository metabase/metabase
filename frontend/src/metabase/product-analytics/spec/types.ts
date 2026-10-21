/**
 * Analysis spec: serialisable clause vocabulary.
 *
 * Event definitions are flag columns on `events_base` (e.g. `{ flag: "ev_1" }`),
 * produced by the Metabase filter picker as boolean custom expressions. Date
 * range and attribute filters live in the MBQL base query, not here.
 */

import type {
  DateTimeAbsoluteUnit,
  ProductAnalyticsKind,
} from "metabase-types/api";

export type AnalysisKind = ProductAnalyticsKind;

export type Granularity = Extract<
  DateTimeAbsoluteUnit,
  "hour" | "day" | "week" | "month"
>;
export type TimeUnit = Extract<
  DateTimeAbsoluteUnit,
  "minute" | "hour" | "day" | "week" | "month"
>;
export type Period = Extract<DateTimeAbsoluteUnit, "day" | "week" | "month">;

export type FlagRef = {
  flag: string;
};

export interface Duration {
  value: number;
  unit: TimeUnit;
}

export type Grain = "person" | "session" | "event";

export type Aggregate = "count" | "uniq" | "sum" | "avg" | "min" | "max";

export interface Measure {
  agg: Aggregate;
  /** Column on events_base. Absent for `count` and for "count the grain". */
  field?: string;
}

export interface TimeRange {
  preset: string;
  tz: string;
}

export interface Bucket {
  granularity: Granularity;
}

export type CountOp = "at least" | "at most" | "exactly";

export type ActorPredicate =
  | { kind: "did"; flag: string; cmp: CountOp; count: number }
  | { kind: "didnt"; flag: string }
  | {
      kind: "group";
      joiner: "and" | "or";
      negated: boolean;
      items: ActorPredicate[];
    };

export interface Step {
  index: number;
  flag: string;
  label: string;
}

export interface Exclusion {
  flag: string;
  fromStep: number;
  toStep: number;
}

export interface FunnelSpec {
  steps: Step[];
  exclusions: Exclusion[];
  window: Duration;
  anchor: "first" | "each";
  ordering: "strict" | "loose" | "any";
  allowRetry: boolean;
}

export interface PathsSpec {
  direction: "from" | "to" | "between";
  /** Null: paths start at the first step of each visit. Unused for "to". */
  start: FlagRef | null;
  /** Null: paths end at the last step of each visit. Unused for "from". */
  end: FlagRef | null;
  steps: number;
  included: FlagRef[];
  sessionGapMinutes: number;
  mergeRepeats: boolean;
  /** Drops steps that make up an outsized share of all events. */
  hideNoisyEvents: boolean;
  maxNodes: number;
  minVolume: number;
}

export interface HabitSpec {
  /** What counts as showing up. Undefined: any event does. */
  active?: FlagRef;
  subPeriod: Extract<Period, "day" | "week">;
  /** "ratio": DAU/MAU, or WAU/MAU by week. */
  measure: "histogram" | "ratio";
}

export type LifecycleStateName =
  | "new"
  | "returning"
  | "resurrected"
  | "dormant";

export interface LifecycleSpec {
  /** What counts as being active. Undefined: any event does. */
  active?: FlagRef;
  period: Period;
  /**
   * Whether `events_base` has when each actor was first seen, as the
   * `first_seen` column. Without it, actors are new in their first active
   * period in the date range.
   */
  hasFirstSeen: boolean;
}

export interface CohortsSpec {
  /**
   * What starts an actor's clock: their first time doing it in the date
   * range. Undefined: any event does.
   */
  start?: FlagRef;
  /**
   * What places an actor in a cohort: the period they started in, or an
   * attribute's value as of their start. Either way, period 0 is the period
   * their clock started; see `planCohorts`.
   */
  by: "startDate" | "attribute";
  /** What counts as coming back. Undefined: any event does. */
  return?: FlagRef;
  returnRule: "exactly" | "onOrAfter";
  horizon: number;
}

export interface OutputSpec {
  funnelView?: "steps" | "overTime" | "timeToConvert";
  cohortsDisplay?: "percent" | "counts";
  /** A row per cohort, or one row for all of them together. */
  cohortsLines?: "each" | "average";
  lifecycleShown?: LifecycleStateName[];
  pathsEdgeMetric?: "people" | "events";
}

export interface AnalysisSpec {
  kind: AnalysisKind;
  timeRange: TimeRange;
  grain: Grain;
  measure: Measure;
  bucket: Bucket;
  split?: boolean;
  scope: ActorPredicate;
  /** Events that paths name by their `url_path` rather than their `event_name`. */
  pageview?: FlagRef;
  funnel?: FunnelSpec;
  paths?: PathsSpec;
  habit?: HabitSpec;
  lifecycle?: LifecycleSpec;
  cohorts?: CohortsSpec;
  output: OutputSpec;
}
