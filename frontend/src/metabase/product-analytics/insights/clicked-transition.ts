import type { ClickObject } from "metabase/visualizations/types";

import type { AnalysisSpec } from "../spec/types";
import { getFunnelStepLabel } from "../sql/analyses/funnel";

import type { FunnelInsightsState } from "./use-funnel-insights";

/**
 * The clicked step of the "Step by step" chart, numbered from 1. Undefined
 * for the other views.
 */
export const getClickedStep = (
  spec: AnalysisSpec | undefined,
  clicked: ClickObject,
): number | undefined => {
  const funnel = spec?.funnel;
  const isStepsView = (spec?.output.funnelView ?? "steps") === "steps";
  if (funnel === undefined || !isStepsView) {
    return undefined;
  }
  const value = clicked.dimensions?.[0]?.value;
  const stepIndex = funnel.steps.findIndex(
    ({ label }, index) => getFunnelStepLabel(index + 1, label) === value,
  );
  return stepIndex >= 0 ? stepIndex + 1 : undefined;
};

/**
 * The transition into a clicked step of the "Step by step" chart, when it has
 * insights to show. Undefined for the first step and for the other views.
 */
export const getClickedTransition = (
  spec: AnalysisSpec | undefined,
  state: FunnelInsightsState,
  clicked: ClickObject,
): number | undefined => {
  const step = getClickedStep(spec, clicked);
  if (step === undefined || state.status !== "done") {
    return undefined;
  }
  // Step k + 1 is entered through transition k.
  const transition = step - 1;
  const hasInsights =
    transition >= 1 &&
    state.insights.some((insight) => insight.transition === transition);
  return hasInsights ? transition : undefined;
};
