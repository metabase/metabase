import { t } from "ttag";

import { hasActionsMenu } from "metabase/lib/click-behavior";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import type {
  ClickBehaviorType,
  QuestionDashboardCard,
} from "metabase-types/api";

export function useClickBehaviorOptionName(
  value: ClickBehaviorType,
  dashcard: QuestionDashboardCard,
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
