import { t } from "ttag";
import {
  PLUGIN_ADMIN_NAV_ITEMS,
  PLUGIN_ADMIN_ROUTES,
  PLUGIN_ADMIN_USER_MENU_ITEMS,
  PLUGIN_ADMIN_USER_MENU_ROUTES,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import getAuditRoutes, { getUserMenuRotes } from "./routes";

if (hasPremiumFeature("audit_app")) {
  PLUGIN_ADMIN_NAV_ITEMS.push({
    name: t`Audit`,
    path: "/admin/audit",
    key: "audit",
  });
  PLUGIN_ADMIN_ROUTES.push(getAuditRoutes);

  PLUGIN_ADMIN_USER_MENU_ITEMS.push(user => [
    {
      title: t`Unsubscribe from all subscriptions / alerts`,
      link: `/admin/people/${user.id}/unsubscribe`,
    },
  ]);

  PLUGIN_ADMIN_USER_MENU_ROUTES.push(getUserMenuRotes);
}
