/**
 * Analysis spec: serialisable clause vocabulary.
 *
 * Event definitions are flag columns on `events_base` (e.g. `{ flag: "ev_1" }`),
 * produced by the Metabase filter picker as boolean custom expressions. Date
 * range and attribute filters live in the MBQL base query, not here.
 */

import type { DateTimeAbsoluteUnit } from "metabase-types/api";

export type AnalysisKind =
  | "funnel"
  | "paths"
  | "habit"
  | "lifecycle"
  | "cohorts";

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
  start: FlagRef;
  end: FlagRef;
  steps: number;
  included: FlagRef[];
  sessionGapMinutes: number;
  mergeRepeats: boolean;
  collapseNoise: boolean;
  maxNodes: number;
  minVolume: number;
}

export interface HabitSpec {
  active: FlagRef;
  lookback: Duration;
  subPeriod: Extract<Period, "day" | "week">;
  measure: "histogram" | "ratio" | "threshold";
  threshold: number;
}

export type LifecycleStateName =
  | "new"
  | "returning"
  | "resurrected"
  | "dormant";

export interface LifecycleSpec {
  active: FlagRef;
  period: Period;
}

export interface CohortsSpec {
  rowMode: "defined" | "started";
  start: FlagRef;
  startPeriods: number;
  return: FlagRef;
  returnRule: "exactly" | "onOrAfter";
  horizon: number;
}

export interface OutputSpec {
  funnelView?: "steps" | "overTime" | "timeToConvert";
  cohortsDisplay?: "percent" | "counts";
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
  funnel?: FunnelSpec;
  paths?: PathsSpec;
  habit?: HabitSpec;
  lifecycle?: LifecycleSpec;
  cohorts?: CohortsSpec;
  output: OutputSpec;
}
