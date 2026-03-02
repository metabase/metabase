import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { PaddedSidebarLink } from "metabase/nav/containers/MainNavbar/MainNavbar.styled";

export function ProductAnalyticsNavItem() {
  // TODO: restore `enable-product-analytics?` guard once the setting is wired up
  const eventsTableId = useSetting("product-analytics-events-table-id");
  const sessionsTableId = useSetting("product-analytics-sessions-table-id");

  return (
    <>
      {eventsTableId && (
        <PaddedSidebarLink
          icon="insight"
          url={`/auto/dashboard/table/${eventsTableId}/rule/EventTable/WebAnalytics`}
        >
          {t`Web Analytics`}
        </PaddedSidebarLink>
      )}
      {sessionsTableId && (
        <PaddedSidebarLink
          icon="location"
          url={`/auto/dashboard/table/${sessionsTableId}/rule/GenericTable/VisitorsAndLocations`}
        >
          {t`Visitors & Locations`}
        </PaddedSidebarLink>
      )}
    </>
  );
}
