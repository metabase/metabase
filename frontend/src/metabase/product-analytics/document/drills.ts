import { c } from "ttag";

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
};

const getClickedStep = (
  clicked: ClickObject,
  funnelSteps: readonly EventDefinition[],
): EventDefinition | undefined => {
  const value = clicked.dimensions?.find(
    ({ column }) => column.name === STEP_LABEL_COLUMN,
  )?.value;
  const match = typeof value === "string" ? STEP_LABEL.exec(value) : null;
  return match !== null ? funnelSteps[Number(match[1]) - 1] : undefined;
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

/** Drill-throughs that add the analysis they lead to below the clicked one. */
export const getDocumentDrillsMode = ({
  funnelSteps,
  onInsertBelow,
}: GetDocumentDrillsModeArgs): ClickActionsMode => ({
  actionsForClick: (clicked) => {
    const step =
      funnelSteps !== undefined
        ? getClickedStep(clicked, funnelSteps)
        : undefined;
    return step !== undefined
      ? [getPathsAfterStepAction(step, onInsertBelow)]
      : [];
  },
});
