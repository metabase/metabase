import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import {
  PLUGIN_ADMIN_USER_MENU_ITEMS,
  PLUGIN_ADMIN_USER_MENU_ROUTES,
  PLUGIN_AUDIT,
} from "metabase/plugins";
import { Menu } from "metabase/ui";
import { isInternalUser } from "metabase/urls";
import { handleMetabotSlashCommand } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/slash-commands";
import {
  getAiAuditingRoutes,
  getAiAuditingUpsellRoutes,
} from "metabase-enterprise/monitor/ai-auditing/routes";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { User } from "metabase-types/api";

import { getCliAnalyticsNavItems } from "./cli-analytics/nav";
import { getCliAnalyticsRoutes } from "./cli-analytics/routes";
import { InsightsLink } from "./components/InsightsLink";
import { InsightsMenuItem } from "./components/InsightsMenuItem";
import { getUserMenuRoutes } from "./routes";
import { isAuditDb } from "./utils";

const getUserMenuItems = (user: User): React.ReactNode => [
  <Menu.Item
    component={ForwardRefLink}
    to={
      isInternalUser(user)
        ? `/admin/people/${user.id}/unsubscribe`
        : `/admin/people/tenants/people/${user.id}/unsubscribe`
    }
    key="unsubscribe"
  >
    {t`Unsubscribe from all subscriptions / alerts`}
  </Menu.Item>,
];

/**
 * Initialize audit app plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("audit_app")) {
    PLUGIN_ADMIN_USER_MENU_ITEMS.push(getUserMenuItems);
    PLUGIN_ADMIN_USER_MENU_ROUTES.push(getUserMenuRoutes);
    PLUGIN_AUDIT.isEnabled = true;
    PLUGIN_AUDIT.isAuditDb = isAuditDb;
    PLUGIN_AUDIT.InsightsLink = InsightsLink;
    PLUGIN_AUDIT.InsightsMenuItem = InsightsMenuItem;
    PLUGIN_AUDIT.isAiAuditingEnabled = true;
    PLUGIN_AUDIT.getAiAuditingRoutes = hasPremiumFeature("ai_controls")
      ? getAiAuditingRoutes
      : getAiAuditingUpsellRoutes;
    PLUGIN_AUDIT.getCliAnalyticsNavItems = getCliAnalyticsNavItems;
    PLUGIN_AUDIT.getCliAnalyticsRoutes = getCliAnalyticsRoutes;
    PLUGIN_AUDIT.handleMetabotSlashCommand = handleMetabotSlashCommand;
  }
}
