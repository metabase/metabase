import type { ClickObject } from "metabase/visualizations/types";

import type { AnalysisSpec } from "../spec/types";
import { getFunnelStepLabel } from "../sql/analyses/funnel";

import type { FunnelInsightsState } from "./use-funnel-insights";

/**
 * The transition into a clicked step of the "Step by step" chart, when it has
 * insights to show. Undefined for the first step and for the other views.
 */
export const getClickedTransition = (
  spec: AnalysisSpec | undefined,
  state: FunnelInsightsState,
  clicked: ClickObject,
): number | undefined => {
  const funnel = spec?.funnel;
  const isStepsView = (spec?.output.funnelView ?? "steps") === "steps";
  if (funnel === undefined || !isStepsView || state.status !== "done") {
    return undefined;
  }
  const value = clicked.dimensions?.[0]?.value;
  const stepIndex = funnel.steps.findIndex(
    ({ label }, index) => getFunnelStepLabel(index + 1, label) === value,
  );
  // Step k + 1 is entered through transition k.
  const transition = stepIndex;
  const hasInsights =
    transition >= 1 &&
    state.insights.some((insight) => insight.transition === transition);
  return hasInsights ? transition : undefined;
};
