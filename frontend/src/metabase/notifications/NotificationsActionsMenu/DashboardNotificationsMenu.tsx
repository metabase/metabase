import { useState } from "react";

import { setSharing as setDashboardSubscriptionSidebarOpen } from "metabase/dashboard/actions";
import { getIsSharing as getIsDashboardSubscriptionSidebarOpen } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { DashboardSubscriptionMenuItem } from "metabase/notifications/DashboardSubscriptionMenuItem";
import type { DashboardNotificationsModalType } from "metabase/notifications/NotificationsActionsMenu/types";
import { Flex } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { NotificationsMenu } from "./NotificationsMenu";
import { NotificationsModals } from "./NotificationsModals";

export function DashboardNotificationsMenu({
  dashboard,
}: {
  dashboard: Dashboard;
}) {
  const dispatch = useDispatch();

  const isDashboardSubscriptionSidebarOpen = useSelector(
    getIsDashboardSubscriptionSidebarOpen,
  );
  const toggleSubscriptionSidebar = () =>
    dispatch(
      setDashboardSubscriptionSidebarOpen(!isDashboardSubscriptionSidebarOpen),
    );

  const [modalType, setModalType] =
    useState<DashboardNotificationsModalType | null>(null);

  const isArchived = dashboard.archived;

  if (isArchived) {
    return null;
  }

  return (
    <Flex>
      <NotificationsMenu>
        <DashboardSubscriptionMenuItem
          onClick={toggleSubscriptionSidebar}
          dashboard={dashboard}
        />
      </NotificationsMenu>
      <NotificationsModals
        modalType={modalType}
        dashboard={dashboard}
        onClose={() => setModalType(null)}
      />
    </Flex>
  );
}
