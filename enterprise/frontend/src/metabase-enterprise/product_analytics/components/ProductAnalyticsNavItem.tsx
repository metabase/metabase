import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { PaddedSidebarLink } from "metabase/nav/containers/MainNavbar/MainNavbar.styled";

export function ProductAnalyticsNavItem() {
  const enabled = useSetting("enable-product-analytics?");
  const tableId = useSetting("product-analytics-events-table-id");

  if (!enabled || !tableId) {
    return null;
  }

  const url = `/auto/dashboard/table/${tableId}/rule/EventTable/WebAnalytics`;

  return (
    <PaddedSidebarLink icon="insight" url={url}>
      {t`Web Analytics`}
    </PaddedSidebarLink>
  );
}
