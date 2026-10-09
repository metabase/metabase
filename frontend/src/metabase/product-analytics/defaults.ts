import type { ActorPredicate, AnalysisKind, AnalysisSpec } from "./spec/types";

const emptyScope: ActorPredicate = {
  kind: "group",
  joiner: "and",
  negated: false,
  items: [],
};

const chrome = {
  timeRange: { preset: "Last 90 days", tz: "UTC" },
  grain: "person" as const,
  measure: { agg: "uniq" as const },
  bucket: { granularity: "week" as const },
  scope: emptyScope,
};

export const FLAG = {
  pricing: "ev_1",
  trial: "ev_2",
  checkout: "ev_3",
  signup: "ev_4",
  active: "ev_5",
  invite: "ev_6",
  error: "ev_7",
  report: "ev_8",
} as const;

export const defaultSpec = (kind: AnalysisKind): AnalysisSpec => {
  switch (kind) {
    case "funnel":
      return {
        kind,
        ...chrome,
        funnel: {
          steps: [
            { index: 0, flag: FLAG.pricing, label: "Viewed pricing" },
            { index: 1, flag: FLAG.trial, label: "Started trial" },
            { index: 2, flag: FLAG.checkout, label: "Purchased" },
          ],
          exclusions: [],
          window: { value: 30, unit: "day" },
          anchor: "first",
          ordering: "loose",
          allowRetry: false,
        },
        output: { funnelView: "steps" },
      };
    case "paths":
      return {
        kind,
        ...chrome,
        paths: {
          direction: "from",
          start: { flag: FLAG.pricing },
          end: { flag: FLAG.checkout },
          steps: 4,
          included: [
            { flag: FLAG.pricing },
            { flag: FLAG.signup },
            { flag: FLAG.trial },
            { flag: FLAG.active },
            { flag: FLAG.invite },
            { flag: FLAG.report },
            { flag: FLAG.checkout },
          ],
          sessionGapMinutes: 30,
          mergeRepeats: true,
          collapseNoise: true,
          maxNodes: 8,
          minVolume: 5,
        },
        output: { pathsEdgeMetric: "people" },
      };
    case "habit":
      return {
        kind,
        ...chrome,
        habit: {
          active: { flag: FLAG.active },
          lookback: { value: 28, unit: "day" },
          subPeriod: "day",
          measure: "histogram",
          threshold: 5,
        },
        output: {},
      };
    case "lifecycle":
      return {
        kind,
        ...chrome,
        lifecycle: {
          active: { flag: FLAG.active },
          period: "week",
        },
        output: {
          lifecycleShown: ["new", "returning", "resurrected", "dormant"],
        },
      };
    case "cohorts":
      return {
        kind,
        ...chrome,
        cohorts: {
          rowMode: "started",
          start: { flag: FLAG.signup },
          startPeriods: 8,
          return: { flag: FLAG.active },
          returnRule: "onOrAfter",
          horizon: 8,
        },
        output: { cohortsDisplay: "percent" },
      };
  }
};
