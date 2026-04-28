import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import {
  PLUGIN_ADMIN_USER_MENU_ITEMS,
  PLUGIN_ADMIN_USER_MENU_ROUTES,
  PLUGIN_AUDIT,
} from "metabase/plugins";
import { Menu } from "metabase/ui";
import { isInternalUser } from "metabase/utils/urls";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { InsightsLink } from "./components/InsightsLink";
import { InsightsMenuItem } from "./components/InsightsMenuItem";
import { getMetabotAnalyticsNavItems } from "./metabot-analytics/nav";
import { getAiAnalyticsRoutes } from "./metabot-analytics/routes";
import { handleMetabotSlashCommand } from "./metabot-analytics/slash-commands";
import { getUserMenuRotes } from "./routes";
import { isAuditDb } from "./utils";

/**
 * Initialize audit app plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("audit_app")) {
    // Add new menu item function
    const menuItemFunction = (user) => [
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

    PLUGIN_ADMIN_USER_MENU_ITEMS.push(menuItemFunction);
    PLUGIN_ADMIN_USER_MENU_ROUTES.push(getUserMenuRotes);
    PLUGIN_AUDIT.isEnabled = true;
    PLUGIN_AUDIT.isAuditDb = isAuditDb;
    PLUGIN_AUDIT.InsightsLink = InsightsLink;
    PLUGIN_AUDIT.InsightsMenuItem = InsightsMenuItem;
    PLUGIN_AUDIT.getMetabotAnalyticsNavItems = getMetabotAnalyticsNavItems;
    PLUGIN_AUDIT.getAiAnalyticsRoutes = getAiAnalyticsRoutes;
    PLUGIN_AUDIT.handleMetabotSlashCommand = handleMetabotSlashCommand;
  }
}
