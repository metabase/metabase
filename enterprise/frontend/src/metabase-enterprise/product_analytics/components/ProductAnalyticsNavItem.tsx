import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { PaddedSidebarLink } from "metabase/nav/containers/MainNavbar/MainNavbar.styled";

export function ProductAnalyticsNavItem() {
  const enabled = useSetting("enable-product-analytics?");
  const eventsTableId = useSetting("product-analytics-events-table-id");
  const sessionsTableId = useSetting("product-analytics-sessions-table-id");

  if (!enabled) {
    return null;
  }

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
      {eventsTableId && (
        <PaddedSidebarLink
          icon="funnel"
          url={`/auto/dashboard/table/${eventsTableId}/rule/EventTable/FunnelFlows`}
        >
          {t`Funnel Flows`}
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
