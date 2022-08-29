import { t } from "ttag";
import { hasActionsMenu } from "metabase/lib/click-behavior";

export const clickBehaviorOptions = [
  { value: "menu", icon: "popover" },
  { value: "link", icon: "link" },
  { value: "crossfilter", icon: "filter" },
  { value: "action", icon: "play" },
];

export function getClickBehaviorOptionName(value, dashcard) {
  if (value === "menu") {
    return hasActionsMenu(dashcard)
      ? t`Open the Metabase actions menu`
      : t`Do nothing`;
  }
  if (value === "link") {
    return t`Go to a custom destination`;
  }
  if (value === "crossfilter") {
    return t`Update a dashboard filter`;
  }
  if (value === "action") {
    return t`Perform action`;
  }
  return t`Unknown`;
}
