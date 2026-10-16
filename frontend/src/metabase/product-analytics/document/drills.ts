import { c, t } from "ttag";

import type {
  ClickAction,
  ClickActionsMode,
  ClickObject,
} from "metabase/visualizations/types";
import type { ProductAnalyticsNodeDefinition } from "metabase-types/api";

import type { EventDefinition } from "../events/types";

/** The funnel step chart labels each bar "<step number>. <step name>". */
const STEP_LABEL = /^(\d+)\. /;
const STEP_LABEL_COLUMN = "label";

type GetDocumentDrillsModeArgs = {
  /** The funnel's steps, when it shows them step by step. */
  funnelSteps: readonly EventDefinition[] | undefined;
  onInsertBelow: (definition: ProductAnalyticsNodeDefinition) => void;
  /** Omit when the funnel has no insights. */
  onShowInsights?: (transition: number) => void;
};

type ClickedStep = {
  step: EventDefinition;
  /** Numbered from 1, like the chart labels. */
  stepNumber: number;
};

const getClickedStep = (
  clicked: ClickObject,
  funnelSteps: readonly EventDefinition[],
): ClickedStep | undefined => {
  const value = clicked.dimensions?.find(
    ({ column }) => column.name === STEP_LABEL_COLUMN,
  )?.value;
  const match = typeof value === "string" ? STEP_LABEL.exec(value) : null;
  const stepNumber = match !== null ? Number(match[1]) : undefined;
  const step =
    stepNumber !== undefined ? funnelSteps[stepNumber - 1] : undefined;
  return step !== undefined && stepNumber !== undefined
    ? { step, stepNumber }
    : undefined;
};

const getPathsAfterStepAction = (
  step: EventDefinition,
  onInsertBelow: GetDocumentDrillsModeArgs["onInsertBelow"],
): ClickAction => ({
  name: "product-analytics.paths-after-step",
  type: "custom",
  section: "custom",
  buttonType: "horizontal",
  icon: "sankey",
  title: c("{0} is a funnel step name").t`Where people went after ${step.name}`,
  onClick: ({ closePopover }) => {
    onInsertBelow({
      version: 1,
      kind: "paths",
      settings: { "paths.direction": "from", "paths.start": step },
    });
    closePopover();
  },
});

const getShowInsightsAction = (onShow: () => void): ClickAction => ({
  name: "product-analytics.show-insights",
  type: "custom",
  section: "custom",
  buttonType: "horizontal",
  icon: "insight",
  title: t`Show insights`,
  onClick: ({ closePopover }) => {
    onShow();
    closePopover();
  },
});

/**
 * Drill-throughs from a funnel step: paths after it, added below the clicked
 * analysis, and the insights into reaching it.
 */
export const getDocumentDrillsMode = ({
  funnelSteps,
  onInsertBelow,
  onShowInsights,
}: GetDocumentDrillsModeArgs): ClickActionsMode => ({
  actionsForClick: (clicked) => {
    const clickedStep =
      funnelSteps !== undefined
        ? getClickedStep(clicked, funnelSteps)
        : undefined;
    if (clickedStep === undefined) {
      return [];
    }
    const { step, stepNumber } = clickedStep;
    // Step k + 1 is reached through transition k, so the first step has none.
    const transition = stepNumber - 1;
    const isReachedThroughTransition = transition >= 1;
    return [
      ...(onShowInsights !== undefined && isReachedThroughTransition
        ? [getShowInsightsAction(() => onShowInsights(transition))]
        : []),
      getPathsAfterStepAction(step, onInsertBelow),
    ];
  },
});
