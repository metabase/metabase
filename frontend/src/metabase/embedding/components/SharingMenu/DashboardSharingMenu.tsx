import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { setSharing as setDashboardSubscriptionSidebarOpen } from "metabase/dashboard/actions";
import {
  getIsDashCardsRunning,
  getIsSharing as getIsDashboardSubscriptionSidebarOpen,
} from "metabase/dashboard/selectors";
import { GUEST_EMBED_EMBEDDING_TYPE } from "metabase/embedding/constants";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { DashboardSubscriptionMenuItem } from "metabase/notifications/NotificationsActionsMenu/DashboardSubscriptionMenuItem";
import { Flex, Menu } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { useSharingModal } from "../../hooks/use-sharing-modal";

import { EmbedMenuItem } from "./MenuItems/EmbedMenuItem";
import { ExportPdfMenuItem } from "./MenuItems/ExportPdfMenuItem";
import { PublicLinkMenuItem } from "./MenuItems/PublicLinkMenuItem";
import { PublicLinkModals } from "./PublicLinkModals";
import { SharingMenu } from "./SharingMenu";
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

  const { modalType, setModalType } =
    useSharingModal<DashboardSharingModalType>({
      resource: dashboard,
      resourceType: "dashboard",
    });

  const hasPublicLink = !!dashboard?.public_uuid;
  const isArchived = dashboard.archived;
  const isAnalytics =
    dashboard.collection && isInstanceAnalyticsCollection(dashboard.collection);

  const canShare = !isAnalytics;
  const isDashCardsRunning = useSelector(getIsDashCardsRunning);

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
        <ExportPdfMenuItem dashboard={dashboard} loading={isDashCardsRunning} />
        {canShare && (
          <>
            <Menu.Divider />
            <PublicLinkMenuItem
              hasPublicLink={hasPublicLink}
              onClick={() => setModalType("dashboard-public-link")}
            />
            <EmbedMenuItem
              onClick={() => setModalType(GUEST_EMBED_EMBEDDING_TYPE)}
            />
          </>
        )}
      </SharingMenu>
      <PublicLinkModals
        modalType={modalType}
        dashboard={dashboard}
        onClose={() => setModalType(null)}
      />
    </Flex>
  );
}
