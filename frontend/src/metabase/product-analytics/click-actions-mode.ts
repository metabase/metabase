import { t } from "ttag";

import type {
  ClickAction,
  ClickActionsMode,
  ClickObject,
} from "metabase/visualizations/types";

const getHelloWorldAction = (clicked: ClickObject): ClickAction => ({
  name: "product-analytics.hello-world",
  type: "custom",
  section: "custom",
  title: t`Hello world`,
  icon: "bolt",
  buttonType: "horizontal",
  onClick: ({ closePopover }) => {
    const clickedValues = (clicked.dimensions ?? [])
      .map(({ column, value }) => `${column.display_name}: ${value}`)
      .join(", ");
    window.alert(t`Hello world! You clicked ${clickedValues}`);
    closePopover();
  },
});

/** Click actions offered on product analytics results, in place of the usual drills. */
export const PRODUCT_ANALYTICS_CLICK_ACTIONS_MODE: ClickActionsMode = {
  actionsForClick: (clicked) =>
    clicked.dimensions != null ? [getHelloWorldAction(clicked)] : [],
};
