import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import type { ClickBehaviorType, DashboardCard } from "metabase-types/api";

import { hasActionsMenu } from "../../utils";

export function useClickBehaviorOptionName(
  value: ClickBehaviorType,
  dashcard: DashboardCard,
) {
  const applicationName = useSelector(getApplicationName);
  if (value === "actionMenu") {
    return hasActionsMenu(dashcard)
      ? t`Open the ${applicationName} drill-through menu`
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
