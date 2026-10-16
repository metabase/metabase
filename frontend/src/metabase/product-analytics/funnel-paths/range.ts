import type { AnalysisSpec, FunnelSpec } from "../spec/types";
import type { FunnelPathsRange } from "../sql/analyses/funnel-paths";

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

/** The whole funnel, from its first step to its last. */
export const getWholeFunnelRange = (funnel: FunnelSpec): FunnelPathsRange => ({
  start: 1,
  end: funnel.steps.length,
});

/** Each step to the next: range k is transition k. */
export const getTransitionRanges = (funnel: FunnelSpec): FunnelPathsRange[] =>
  funnel.steps
    .slice(1)
    .map((_, index) => ({ start: index + 1, end: index + 2 }));
