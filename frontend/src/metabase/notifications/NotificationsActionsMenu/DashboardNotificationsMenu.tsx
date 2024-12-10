import { useState } from "react";

import { setSharing as setDashboardSubscriptionSidebarOpen } from "metabase/dashboard/actions";
import { getIsSharing as getIsDashboardSubscriptionSidebarOpen } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { DashboardNotificationsModalType } from "metabase/notifications/types";
import { Flex } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { DashboardSubscriptionMenuItem } from "../../sharing/components/SharingMenu/MenuItems/DashboardSubscriptionMenuItem";

import { SharingMenu } from "./SharingMenu";
import { SharingModals } from "./SharingModals";

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
      <SharingMenu>
        <DashboardSubscriptionMenuItem
          onClick={toggleSubscriptionSidebar}
          dashboard={dashboard}
        />
      </SharingMenu>
      <SharingModals
        modalType={modalType}
        dashboard={dashboard}
        onClose={() => setModalType(null)}
      />
    </Flex>
  );
}
