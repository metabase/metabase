import { setSharing as setDashboardSubscriptionSidebarOpen } from "metabase/dashboard/actions";
import { getIsSharing as getIsDashboardSubscriptionSidebarOpen } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { DashboardSubscriptionMenuItem } from "metabase/notifications/NotificationsActionsMenu/DashboardSubscriptionMenuItem";
import { canManageSubscriptions as canManageSubscriptionsSelector } from "metabase/selectors/user";
import type { Dashboard } from "metabase-types/api";

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

  const isArchived = dashboard.archived;

  const canManageSubscriptions = useSelector(canManageSubscriptionsSelector);

  // dashcardData only contains question cards, text ones don't appear here
  const hasDataCards = dashboard?.dashcards?.some(
    dashCard => !["text", "heading"].includes(dashCard.card.display),
  );

  if (!canManageSubscriptions || !hasDataCards || isArchived) {
    return null;
  }

  return <DashboardSubscriptionMenuItem onClick={toggleSubscriptionSidebar} />;
}
