import { useState } from "react";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { setSharing as setDashboardSubscriptionSidebarOpen } from "metabase/dashboard/actions";
import { getIsSharing as getIsDashboardSubscriptionSidebarOpen } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Flex, Menu } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { DashboardSubscriptionMenuItem } from "./MenuItems/DashboardSubscriptionMenuItem";
import { EmbedMenuItem } from "./MenuItems/EmbedMenuItem";
import { ExportPdfMenuItem } from "./MenuItems/ExportPdfMenuItem";
import { PublicLinkMenuItem } from "./MenuItems/PublicLinkMenuItem";
import { SharingMenu } from "./SharingMenu";
import { SharingModals } from "./SharingModals";
import type { DashboardSharingModalType } from "./types";

export function DashboardSharingMenu({ dashboard }: { dashboard: Dashboard }) {
  const dispatch = useDispatch();

  const isDashboardSubscriptionSidebarOpen = useSelector(
    getIsDashboardSubscriptionSidebarOpen,
  );
  const toggleSubscriptionSidebar = () =>
    dispatch(
      setDashboardSubscriptionSidebarOpen(!isDashboardSubscriptionSidebarOpen),
    );

  const [modalType, setModalType] = useState<DashboardSharingModalType | null>(
    null,
  );

  const hasPublicLink = !!dashboard?.public_uuid;
  const isArchived = dashboard.archived;
  const isAnalytics =
    dashboard.collection && isInstanceAnalyticsCollection(dashboard.collection);

  const canShare = !isAnalytics;

  if (isArchived) {
    return null;
  }

  return (
    <Flex>
      <SharingMenu>
        <DashboardSubscriptionMenuItem
          onClick={toggleSubscriptionSidebar}
          dashboard={dashboard}
        />
        <ExportPdfMenuItem dashboard={dashboard} />
        {!!canShare && (
          <>
            <Menu.Divider />
            <PublicLinkMenuItem
              hasPublicLink={hasPublicLink}
              onClick={() => setModalType("dashboard-public-link")}
            />
            <EmbedMenuItem onClick={() => setModalType("dashboard-embed")} />
          </>
        )}
      </SharingMenu>
      <SharingModals
        modalType={modalType}
        dashboard={dashboard}
        onClose={() => setModalType(null)}
      />
    </Flex>
  );
}
