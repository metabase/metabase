// Helpers and external entry points for heuristic variants. Variants may
// import from "./types" and "./shared" only, so anything a variant needs from
// outside this folder is re-exported here.
import * as Lib from "metabase-lib";
import type { CardDisplayType } from "metabase-types/api";

import type {
  Decision as DefaultVizDecision,
  TwoStageDecision as DefaultVizTwoStageDecision,
} from "../default-viz";
import { chooseDefaultViz, chooseDefaultVizTwoStage } from "../default-viz";

import type { VizDecision, VizDimensionType, VizInput } from "./types";

export { chooseDefaultViz, chooseDefaultVizTwoStage };
export type { DefaultVizDecision, DefaultVizTwoStageDecision };

/**
 * Mirrors MetricsViewerDisplayType in metabase/common/metrics-viewer (parity
 * asserted in shared.unit.spec).
 */
export type DimensionDisplayType = Extract<
  CardDisplayType,
  "line" | "area" | "bar" | "map" | "scatter" | "scalar"
>;

/** Mirrors DEFAULT_DISPLAY_TYPE_BY_DIMENSION (parity asserted in shared.unit.spec). */
export const DEFAULT_DISPLAY_BY_DIMENSION_TYPE: Record<
  VizDimensionType,
  DimensionDisplayType
> = {
  time: "line",
  geo: "map",
  category: "bar",
  boolean: "bar",
  numeric: "bar",
  scalar: "scalar",
};

/** Mirrors getDimensionBreakoutConfig(type).availableDisplayTypes (parity asserted in shared.unit.spec). */
export const AVAILABLE_DISPLAYS_BY_DIMENSION_TYPE: Record<
  VizDimensionType,
  readonly DimensionDisplayType[]
> = {
  time: ["line", "area", "bar"],
  geo: ["map", "line", "area", "bar"],
  category: ["line", "area", "bar"],
  boolean: ["line", "area", "bar"],
  numeric: ["line", "area", "bar", "scatter"],
  scalar: ["scalar"],
};

export const FALLBACK_DISPLAY: CardDisplayType = "table";

const SCALAR_LIKE_DISPLAYS: readonly CardDisplayType[] = [
  "scalar",
  "progress",
  "gauge",
];

export function isAllowedDisplay<T extends CardDisplayType>(
  display: CardDisplayType,
  allowed: readonly T[],
): display is T {
  return allowed.some((candidate) => candidate === display);
}

/** Mirrors Question._maybeSwitchToScalar: a 1 row × 1 column result is a scalar. */
export function isOneByOne({ cols, rows }: VizInput): boolean {
  return rows?.length === 1 && cols.length === 1;
}

export function switchToScalarIfOneByOne(
  decision: VizDecision,
  input: VizInput,
): VizDecision {
  if (isOneByOne(input) && !SCALAR_LIKE_DISPLAYS.includes(decision.display)) {
    return { ...decision, display: "scalar" };
  }
  return decision;
}

/** The hint as a decision, or the fallback display when there is no hint. */
export function hintDecision(input: VizInput): VizDecision {
  return input.hint
    ? { display: input.hint.display, settings: input.hint.settings }
    : { display: FALLBACK_DISPLAY };
}

/**
 * Keeps `decision` when it is allowed; otherwise the first allowed
 * alternative, then the hint, then the first allowed display.
 */
export function constrainToAllowed(
  decision: VizDecision,
  input: VizInput,
  alternatives: readonly VizDecision[] = [],
): VizDecision {
  const { allowed, hint } = input;
  if (allowed == null || allowed.length === 0) {
    return decision;
  }
  if (isAllowedDisplay(decision.display, allowed)) {
    return decision;
  }
  const alternative = alternatives.find((candidate) =>
    isAllowedDisplay(candidate.display, allowed),
  );
  if (alternative) {
    return { ...alternative, trace: decision.trace };
  }
  if (hint && isAllowedDisplay(hint.display, allowed)) {
    return {
      display: hint.display,
      settings: hint.settings,
      trace: decision.trace,
    };
  }
  return { display: allowed[0], trace: decision.trace };
}

/**
 * Today's default: Lib.defaultDisplay plus the 1×1 → scalar rule. Lives here
 * (not in the legacy-default folder) so other variants can fall back to it.
 */
export function resolveLegacyDefault(input: VizInput): VizDecision {
  const base: VizDecision = input.query
    ? Lib.defaultDisplay(input.query, input.cols)
    : hintDecision(input);
  return constrainToAllowed(switchToScalarIfOneByOne(base, input), input);
}

/**
 * Displays a plain single-series `Visualization` can draw from one result
 * without extra queries or insights (pivot needs a pivot query, object/list a
 * primary key, smartscalar insights, gauge/progress a goal).
 */
export const RENDERABLE_DISPLAYS: readonly CardDisplayType[] = [
  "table",
  "bar",
  "line",
  "pie",
  "scalar",
  "row",
  "area",
  "combo",
  "funnel",
  "map",
  "scatter",
  "waterfall",
  "treemap",
  "sankey",
];
