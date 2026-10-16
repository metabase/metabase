import { t } from "ttag";

import type { ClickAction } from "metabase/visualizations/types";

/** Scrolls to the insights for the clicked part of the chart. */
export const getShowInsightsAction = (onShow: () => void): ClickAction => ({
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

/** Scrolls to the paths into the clicked part of the chart. */
export const getShowPathsAction = (onShow: () => void): ClickAction => ({
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
