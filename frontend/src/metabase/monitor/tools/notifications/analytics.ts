import { trackSimpleEvent } from "metabase/analytics";
import type { CardId, NotificationId } from "metabase-types/api";

import type { NotificationsTab } from "./NotificationsAdminPage/types";

export const trackAlertsManagementTabClicked = (tab: NotificationsTab) => {
  trackSimpleEvent({
    event: "alerts_management_tab_clicked",
    event_detail: tab,
  });
};

export const trackAlertsManagementSearchPerformed = () => {
  trackSimpleEvent({
    event: "alerts_management_search_performed",
  });
};

export const trackAlertsManagementFiltersApplied = () => {
  trackSimpleEvent({
    event: "alerts_management_filters_applied",
  });
};

export const trackAlertsManagementAlertOpened = (
  id: NotificationId,
  triggeredFrom: "table_row" | "sidebar_navigation",
) => {
  trackSimpleEvent({
    event: "alerts_management_alert_opened",
    target_id: id,
    triggered_from: triggeredFrom,
  });
};

export const trackAlertsManagementEditClicked = (id: NotificationId) => {
  trackSimpleEvent({
    event: "alerts_management_edit_clicked",
    target_id: id,
  });
};

export const trackAlertsManagementLinkCopied = (id: NotificationId) => {
  trackSimpleEvent({
    event: "alerts_management_link_copied",
    target_id: id,
  });
};

export const trackAlertsManagementAlertsDeleted = (
  triggeredFrom: "bulk_action_bar" | "detail_sidebar",
  result: "success" | "failure",
  count: number,
) => {
  trackSimpleEvent({
    event: "alerts_management_alerts_deleted",
    triggered_from: triggeredFrom,
    result,
    event_detail: count === 1 ? "single" : "multiple",
  });
};

export const trackAlertsManagementOwnerChanged = (
  result: "success" | "failure",
  count: number,
) => {
  trackSimpleEvent({
    event: "alerts_management_owner_changed",
    result,
    event_detail: count === 1 ? "single" : "multiple",
  });
};

export const trackAlertsManagementRunHistoryViewAllClicked = (
  cardId: CardId | undefined,
  runType: "check" | "send",
) => {
  trackSimpleEvent({
    event: "alerts_management_run_history_view_all_clicked",
    target_id: cardId,
    event_detail: runType,
  });
};
