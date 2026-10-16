import { t } from "ttag";

import type {
  ClickAction,
  ClickActionsMode,
  ClickObject,
} from "metabase/visualizations/types";

import type { FunnelPathsRange } from "./sql/analyses/funnel-paths";

const getShowInsightsAction = (onShow: () => void): ClickAction => ({
  name: "product-analytics.show-insights",
  type: "custom",
  section: "custom",
  title: t`Show insights`,
  icon: "insight",
  buttonType: "horizontal",
  onClick: ({ closePopover }) => {
    onShow();
    closePopover();
  },
});

const getShowPathsAction = (onShow: () => void): ClickAction => ({
  name: "product-analytics.show-paths",
  type: "custom",
  section: "custom",
  title: t`Show paths`,
  icon: "sankey",
  buttonType: "horizontal",
  onClick: ({ closePopover }) => {
    onShow();
    closePopover();
  },
});

type ClickActionsModeOpts = {
  /** The insights transition for a click, or undefined when it has none. */
  getInsightsTransition?: (clicked: ClickObject) => number | undefined;
  onShowInsights?: (transition: number) => void;
  /** The paths range for a click, or undefined when it has none. */
  getPathsRange?: (clicked: ClickObject) => FunnelPathsRange | undefined;
  onShowPaths?: (range: FunnelPathsRange) => void;
};

/** Click actions offered on product analytics results, in place of the usual drills. */
export const getClickActionsMode = ({
  getInsightsTransition,
  onShowInsights,
  getPathsRange,
  onShowPaths,
}: ClickActionsModeOpts = {}): ClickActionsMode => ({
  actionsForClick: (clicked) => {
    if (clicked.dimensions == null) {
      return [];
    }
    const transition = getInsightsTransition?.(clicked);
    const pathsRange = getPathsRange?.(clicked);
    return [
      ...(pathsRange !== undefined && onShowPaths !== undefined
        ? [getShowPathsAction(() => onShowPaths(pathsRange))]
        : []),
      ...(transition !== undefined && onShowInsights !== undefined
        ? [getShowInsightsAction(() => onShowInsights(transition))]
        : []),
    ];
  },
});
