import type { AnalysisSpec, FunnelSpec } from "../spec/types";
import {
  type FunnelPathsRange,
  isValidFunnelPathsRange,
} from "../sql/analyses/funnel-paths";

/** The funnel whose paths can be shown: one with ordered steps. */
export const getPathsFunnel = (
  spec: AnalysisSpec | undefined,
): FunnelSpec | undefined => {
  const funnel = spec?.kind === "funnel" ? spec.funnel : undefined;
  return funnel !== undefined &&
    funnel.ordering !== "any" &&
    funnel.steps.length >= 2
    ? funnel
    : undefined;
};

/** The chosen range while it still fits the funnel, otherwise the whole funnel. */
export const getFunnelPathsRange = (
  funnel: FunnelSpec,
  chosen: FunnelPathsRange | undefined,
): FunnelPathsRange =>
  chosen !== undefined && isValidFunnelPathsRange(funnel, chosen)
    ? chosen
    : { start: 1, end: funnel.steps.length };

/** The paths into a funnel step, numbered from 1. Undefined for the first step. */
export const getPathsRangeInto = (
  funnel: FunnelSpec,
  step: number,
): FunnelPathsRange | undefined => {
  const range = { start: step - 1, end: step };
  return isValidFunnelPathsRange(funnel, range) ? range : undefined;
};
