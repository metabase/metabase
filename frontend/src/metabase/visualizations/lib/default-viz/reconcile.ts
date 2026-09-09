import type { VisualizationSettings } from "metabase-types/api";

import { CAPS, K } from "./constants";
import { firstMapped, profileLookup } from "./mapping";
import { cardinalityOf } from "./shape";
import type {
  CapViolation,
  Decision,
  ReconcileOutcome,
  ReconcileTrace,
  ScoredCandidate,
} from "./types";

const MERGEABLE_KEYS = [
  "map.pin_type",
  "graph.x_axis.axis_enabled",
  "graph.show_values",
] as const;

type SeriesSettingsMap = NonNullable<VisualizationSettings["series_settings"]>;

function seriesMissingSettings(
  settings: Partial<VisualizationSettings>,
): SeriesSettingsMap {
  const entries = Object.entries(settings.series_settings ?? {}).flatMap(
    ([key, value]) => {
      const missing = value?.["line.missing"];
      return missing == null
        ? []
        : [[key, { "line.missing": missing }] as const];
    },
  );
  return Object.fromEntries(entries);
}

function copyIfChanged<Key extends keyof VisualizationSettings>(
  key: Key,
  base: Partial<VisualizationSettings>,
  refined: Partial<VisualizationSettings>,
  settings: Partial<VisualizationSettings>,
): boolean {
  const value = refined[key];
  if (value == null || value === base[key]) {
    return false;
  }
  settings[key] = value;
  return true;
}

function mergeRefinements(
  base: Partial<VisualizationSettings>,
  refined: Partial<VisualizationSettings>,
): { settings: Partial<VisualizationSettings>; mergedKeys: string[] } {
  const settings: Partial<VisualizationSettings> = { ...base };
  const mergedKeys: string[] = MERGEABLE_KEYS.filter((key) =>
    copyIfChanged(key, base, refined, settings),
  );
  const missing = seriesMissingSettings(refined);
  if (Object.keys(missing).length > 0) {
    const merged: SeriesSettingsMap = { ...(base.series_settings ?? {}) };
    for (const [key, value] of Object.entries(missing)) {
      merged[key] = { ...merged[key], ...value };
      mergedKeys.push(`series_settings.${key}.line.missing`);
    }
    settings.series_settings = merged;
  }
  return { settings, mergedKeys };
}

function seriesCap(
  candidate: ScoredCandidate,
  stage2: Decision,
): CapViolation | null {
  const series = firstMapped(
    candidate,
    "series",
    profileLookup(stage2.trace.profiles),
  );
  const card = series ? cardinalityOf(series) : null;
  if (card == null) {
    return null;
  }
  const isLine = candidate.display === "line" || candidate.display === "area";
  if (isLine && card > K.K4_LINE_MAX_SERIES) {
    return {
      cap: "K4_LINE_MAX_SERIES",
      value: card,
      limit: K.K4_LINE_MAX_SERIES,
    };
  }
  const isStackedBar =
    candidate.display === "bar" && candidate.variant === "stacked";
  if (isStackedBar && card > K.K8_STACK_MAX_SERIES) {
    return {
      cap: "K8_STACK_MAX_SERIES",
      value: card,
      limit: K.K8_STACK_MAX_SERIES,
    };
  }
  const isStackedArea =
    candidate.display === "area" && candidate.variant === "stacked";
  if (isStackedArea && card > K.K3_AREA_STACK_MAX_SERIES) {
    return {
      cap: "K3_AREA_STACK_MAX_SERIES",
      value: card,
      limit: K.K3_AREA_STACK_MAX_SERIES,
    };
  }
  return null;
}

function axisCap(
  candidate: ScoredCandidate,
  stage2: Decision,
): CapViolation | null {
  const x = firstMapped(candidate, "x", profileLookup(stage2.trace.profiles));
  const card = x ? cardinalityOf(x) : null;
  if (card == null) {
    return null;
  }
  const isStackedBar =
    candidate.display === "bar" && candidate.variant === "stacked";
  if (isStackedBar && card > K.K9_STACK_MAX_AXIS) {
    return {
      cap: "K9_STACK_MAX_AXIS",
      value: card,
      limit: K.K9_STACK_MAX_AXIS,
    };
  }
  const categorical =
    candidate.display === "bar" || candidate.display === "row";
  if (categorical && card > CAPS.ROW_PROVISIONAL_MAX) {
    return {
      cap: "ROW_PROVISIONAL_MAX",
      value: card,
      limit: CAPS.ROW_PROVISIONAL_MAX,
    };
  }
  return null;
}

function nCap(
  candidate: ScoredCandidate,
  stage2: Decision,
): CapViolation | null {
  const { N } = stage2.trace.shape;
  if (N == null) {
    return null;
  }
  if (candidate.display === "scalar" && N !== 1) {
    return { cap: "SCALAR_N", value: N, limit: 1 };
  }
  if (
    candidate.display === "map" &&
    candidate.variant === "pin" &&
    N > CAPS.PIN_MAX_N
  ) {
    return { cap: "PIN_MAX_N", value: N, limit: CAPS.PIN_MAX_N };
  }
  if (candidate.display === "pivot" && N > K.K10_PIVOT_MAX_CELLS) {
    return {
      cap: "K10_PIVOT_MAX_CELLS",
      value: N,
      limit: K.K10_PIVOT_MAX_CELLS,
    };
  }
  const plotted =
    candidate.display !== "table" && candidate.display !== "object";
  if (plotted && candidate.display !== "scalar" && N <= 1) {
    return { cap: "N_MIN", value: N, limit: 2 };
  }
  return null;
}

export function violatedCaps(
  candidate: ScoredCandidate,
  stage2: Decision,
): CapViolation[] {
  return [
    seriesCap(candidate, stage2),
    axisCap(candidate, stage2),
    nCap(candidate, stage2),
  ].filter((violation): violation is CapViolation => violation != null);
}

function withReconcileTrace(
  decision: Decision,
  trace: ReconcileTrace,
  overrides: Partial<Decision> = {},
  chosenId: string = decision.trace.chosenId,
): Decision {
  return {
    ...decision,
    ...overrides,
    trace: { ...decision.trace, reconcile: trace, chosenId },
  };
}

function outcomeFor(
  stage1: Decision,
  stage2Candidate: ScoredCandidate | null,
  caps: CapViolation[],
): ReconcileOutcome {
  if (stage2Candidate == null) {
    return "stage2-only";
  }
  if (!stage2Candidate.feasible) {
    return "switched-infeasible";
  }
  if (caps.length > 0) {
    return "switched-hard-cap";
  }
  return stage1.provisional ? "switched-provisional" : "kept-stage1";
}

export function reconcile(stage1: Decision, stage2: Decision): Decision {
  const stage2Candidate =
    stage2.trace.candidates.find(
      (candidate) => candidate.id === stage1.trace.chosenId,
    ) ?? null;
  const caps = stage2Candidate ? violatedCaps(stage2Candidate, stage2) : [];
  const outcome = outcomeFor(stage1, stage2Candidate, caps);
  const baseTrace = {
    stage1Display: stage1.display,
    stage2Display: stage2.display,
    violatedCaps: caps,
  };

  if (outcome !== "kept-stage1") {
    return withReconcileTrace(stage2, {
      ...baseTrace,
      outcome,
      mergedSettingKeys: [],
    });
  }

  const { settings, mergedKeys } = mergeRefinements(
    stage1.settings,
    stage2.settings,
  );
  return withReconcileTrace(
    stage2,
    { ...baseTrace, outcome, mergedSettingKeys: mergedKeys },
    {
      display: stage1.display,
      variant: stage1.variant,
      columnMapping: stage1.columnMapping,
      settings,
      suggestedOrderBy: stage1.suggestedOrderBy,
      confidence: stage2.confidence,
      alternatives: stage2.alternatives,
      provisional: false,
      provisionalReasons: [],
    },
    stage1.trace.chosenId,
  );
}
