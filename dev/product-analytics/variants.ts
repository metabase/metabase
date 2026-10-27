/**
 * The analysis variants the MBQL planners are checked against the string
 * planners on, and the hand-written events_base the string planners read.
 */

import type { BaseColumns } from "../../frontend/src/metabase/product-analytics/build-sql";
import type {
  AnalysisSpec,
  BreakoutSpec,
} from "../../frontend/src/metabase/product-analytics/spec/types";
import { BREAKOUT_PROPERTY_COLUMN } from "../../frontend/src/metabase/product-analytics/sql/analyses/breakout";
import { FIRST_SEEN_EXTRA_COLUMN } from "../../frontend/src/metabase/product-analytics/sql/analyses/lifecycle";
import {
  IN_RANGE_FLAG,
  getLookbackDays,
} from "../../frontend/src/metabase/product-analytics/sql/analyses/lookback";

import { FLAG, defaultSpec } from "./specs";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const truth: unknown = await Bun.file(
  `${import.meta.dir}/ground-truth.json`,
).json();
if (
  !isRecord(truth) ||
  typeof truth.start !== "string" ||
  typeof truth.end !== "string"
) {
  throw new Error("ground-truth.json is missing start/end");
}
const DAY_MS = 86_400_000;
const naive = (iso: string): string => iso.slice(0, 19);

/**
 * The data's bounds, and where the date range starts: 40 days in, so
 * analyses with a lookback read history. Naive UTC datetimes.
 */
export const RANGE = {
  start: naive(truth.start),
  end: naive(truth.end),
  rangeStart: naive(
    new Date(Date.parse(truth.start) + 40 * DAY_MS).toISOString(),
  ),
};

const chDateTime = (value: string): string => value.replace("T", " ");

/** Every event in the data, with `in_range` marking the events from `RANGE.rangeStart` on. */
export const EVENTS_BASE_SQL = `
SELECT
  if(created_at >= toDateTime('${chDateTime(RANGE.rangeStart)}'), 1, 0) AS ${IN_RANGE_FLAG},
  person__first_seen_at,
  person_id,
  session_id,
  event_id,
  created_at,
  event_name,
  url_path,
  country,
  if(url_path = '/pricing', 1, 0) AS ev_1,
  if(event_name = 'trial_started', 1, 0) AS ev_2,
  if(event_name = 'checkout_completed', 1, 0) AS ev_3,
  if(event_name = 'signup', 1, 0) AS ev_4,
  if(startsWith(url_path, '/app') OR event_name IN ('report_created', 'invite_sent', 'checkout_completed'), 1, 0) AS ev_5,
  if(event_name = 'invite_sent', 1, 0) AS ev_6,
  if(event_name = 'error', 1, 0) AS ev_7,
  if(event_name = 'report_created', 1, 0) AS ev_8,
  if(event_name = 'integration_connected', 1, 0) AS ev_9
FROM product_analytics.pa_events_resolved
WHERE created_at >= toDateTime('${chDateTime(RANGE.start)}')
  AND created_at < toDateTime('${chDateTime(RANGE.end)}')
`;

const PAID_BREAKOUT: BreakoutSpec = {
  type: "segments",
  groups: [
    { label: "Everyone" },
    { label: "Paid", segment: { flag: "seg_1", isMember: true } },
    { label: "Not paid", segment: { flag: "seg_1", isMember: false } },
  ],
};

export const baseColumnsFor = (spec: AnalysisSpec): BaseColumns => ({
  columns: {
    timestamp: "created_at",
    person: "person_id",
    session: "session_id",
    event_id: "event_id",
    event_name: "event_name",
    url_path: "url_path",
  },
  flags: [
    ...Object.values(FLAG),
    ...(getLookbackDays(spec) > 0 ? [IN_RANGE_FLAG] : []),
  ],
  extraColumns: [
    ...(spec.breakout?.type === "property"
      ? [{ as: BREAKOUT_PROPERTY_COLUMN, alias: "country" }]
      : []),
    ...(spec.lifecycle?.hasFirstSeen
      ? [{ as: FIRST_SEEN_EXTRA_COLUMN, alias: "person__first_seen_at" }]
      : []),
  ],
  peopleSegments:
    spec.breakout?.type === "segments"
      ? {
          sql: "SELECT person_id, if(plan IN ('starter', 'pro', 'business'), 1, 0) AS seg_1 FROM product_analytics.pa_identities_resolved",
          primaryKey: "person_id",
          flags: ["seg_1"],
          required: [],
        }
      : undefined,
});

const F = defaultSpec("funnel");
const P = defaultSpec("paths");
const H = defaultSpec("habit");
const L = defaultSpec("lifecycle");
const C = defaultSpec("cohorts");

const settings =
  <K extends "funnel" | "paths" | "habit" | "lifecycle" | "cohorts">(
    base: AnalysisSpec,
    kind: K,
  ) =>
  (
    over: Partial<NonNullable<AnalysisSpec[K]>>,
    rest: Partial<AnalysisSpec> = {},
  ): AnalysisSpec => ({ ...base, ...rest, [kind]: { ...base[kind], ...over } });

const funnel = settings(F, "funnel");
const paths = settings(P, "paths");
const habit = settings(H, "habit");
const lifecycle = settings(L, "lifecycle");
const cohorts = settings(C, "cohorts");
const view = (
  spec: AnalysisSpec,
  output: AnalysisSpec["output"],
): AnalysisSpec => ({ ...spec, output: { ...spec.output, ...output } });

const didSignup = {
  kind: "did",
  flag: FLAG.signup,
  cmp: "at least",
  count: 1,
} as const;

export const VARIANTS: Record<string, AnalysisSpec> = {
  "funnel/loose/steps": F,
  "funnel/loose/over-time": view(F, { funnelView: "overTime" }),
  "funnel/loose/time-to-convert": view(F, { funnelView: "timeToConvert" }),
  "funnel/strict/steps": funnel({ ordering: "strict" }),
  "funnel/strict/time-to-convert": view(funnel({ ordering: "strict" }), {
    funnelView: "timeToConvert",
  }),
  "funnel/any/steps": funnel({ ordering: "any" }),
  "funnel/any/over-time": view(funnel({ ordering: "any" }), {
    funnelView: "overTime",
  }),
  "funnel/disqualifier": funnel({
    exclusions: [{ flag: FLAG.error, fromStep: 0, toStep: 2 }],
  }),
  "funnel/disqualifier-one-hop": funnel({
    exclusions: [{ flag: FLAG.error, fromStep: 1, toStep: 2 }],
  }),
  "funnel/window-1-day": funnel({ window: { value: 1, unit: "day" } }),
  "funnel/scope-did": funnel(
    {},
    {
      scope: {
        kind: "group",
        joiner: "and",
        negated: false,
        items: [didSignup],
      },
    },
  ),
  "funnel/grain-session": funnel({}, { grain: "session" }),
  "funnel/segments/steps": funnel({}, { breakout: PAID_BREAKOUT }),
  "funnel/property/steps": funnel({}, { breakout: { type: "property" } }),

  // The broken-out over-time view needs no unpivot, so it checks the run
  // query in each ordering.
  ...Object.fromEntries(
    (
      [
        ["loose", {}],
        ["strict", { ordering: "strict" }],
        ["any", { ordering: "any" }],
        [
          "disqualifier",
          { exclusions: [{ flag: FLAG.error, fromStep: 0, toStep: 2 }] },
        ],
        [
          "disqualifier-one-hop",
          { exclusions: [{ flag: FLAG.error, fromStep: 1, toStep: 2 }] },
        ],
        ["window-1-day", { window: { value: 1, unit: "day" } }],
      ] as const
    ).map(([name, over]) => [
      `funnel/runs/${name}`,
      view(funnel(over, { breakout: PAID_BREAKOUT }), {
        funnelView: "overTime",
      }),
    ]),
  ),
  "funnel/runs/grain-session": view(
    funnel({}, { grain: "session", breakout: PAID_BREAKOUT }),
    { funnelView: "overTime" },
  ),

  "paths/from": P,
  "paths/to": paths({ direction: "to" }),
  "paths/between": paths({ direction: "between", end: { flag: FLAG.report } }),
  "paths/from-visit-start": paths({ start: null }),
  "paths/session-visits": paths({ visit: { kind: "session" } }),
  "paths/no-merge": paths({ mergeRepeats: false }),
  "paths/hide-noisy": paths({ hideNoisyEvents: true }),
  "paths/segments": paths({}, { breakout: PAID_BREAKOUT }),

  "habit/histogram": H,
  "habit/histogram-week": habit({ subPeriod: "week" }),
  "habit/any-event": habit({ active: undefined }),
  "habit/percent": habit({ percent: true }),
  "habit/ratio-day": habit({ measure: "ratio" }),
  "habit/ratio-week": habit({ measure: "ratio", subPeriod: "week" }),
  "habit/grain-session": habit({}, { grain: "session" }),
  "habit/scope-did": habit(
    {},
    {
      scope: {
        kind: "group",
        joiner: "and",
        negated: false,
        items: [didSignup],
      },
    },
  ),
  "habit/scope-or-negated": habit(
    {},
    {
      scope: {
        kind: "group",
        joiner: "or",
        negated: true,
        items: [didSignup, { kind: "didnt", flag: FLAG.trial }],
      },
    },
  ),
  "habit/property": habit({}, { breakout: { type: "property" } }),
  "habit/segments/histogram": habit({}, { breakout: PAID_BREAKOUT }),
  "habit/segments/percent": habit(
    { percent: true },
    { breakout: PAID_BREAKOUT },
  ),

  "lifecycle/week": L,
  "lifecycle/no-first-seen": lifecycle({ hasFirstSeen: false }),
  "lifecycle/counted-session": lifecycle({ counted: "session" }),
  "lifecycle/day": lifecycle({ period: "day" }),
  "lifecycle/month": lifecycle({ period: "month" }),
  "lifecycle/segments": lifecycle({}, { breakout: PAID_BREAKOUT }),

  "cohorts/exactly": C,
  "cohorts/on-or-after": cohorts({ returnRule: "onOrAfter" }),
  "cohorts/counts": view(C, { cohortsDisplay: "counts" }),
  "cohorts/average": view(C, { cohortsLines: "average" }),
  "cohorts/from-signup": cohorts({ start: { flag: FLAG.signup } }),
  "cohorts/day": cohorts({}, { bucket: { granularity: "day" } }),
  "cohorts/month": cohorts({}, { bucket: { granularity: "month" } }),
  "cohorts/property": cohorts({}, { breakout: { type: "property" } }),
  "cohorts/segments": cohorts({}, { breakout: PAID_BREAKOUT }),
};
