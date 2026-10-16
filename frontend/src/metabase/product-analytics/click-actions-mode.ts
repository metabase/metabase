import { t } from "ttag";

import type {
  ClickAction,
  ClickActionsMode,
  ClickObject,
} from "metabase/visualizations/types";

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

type ClickActionsModeOpts = {
  /** The insights transition for a click, or undefined when it has none. */
  getInsightsTransition?: (clicked: ClickObject) => number | undefined;
  onShowInsights?: (transition: number) => void;
};

/** Click actions offered on product analytics results, in place of the usual drills. */
export const getClickActionsMode = ({
  getInsightsTransition,
  onShowInsights,
}: ClickActionsModeOpts = {}): ClickActionsMode => ({
  actionsForClick: (clicked) => {
    const transition =
      clicked.dimensions != null ? getInsightsTransition?.(clicked) : undefined;
    return transition !== undefined && onShowInsights !== undefined
      ? [getShowInsightsAction(() => onShowInsights(transition))]
      : [];
  },
});
