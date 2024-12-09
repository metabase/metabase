import { t } from "ttag";

import {
  PLUGIN_ADMIN_USER_MENU_ITEMS,
  PLUGIN_ADMIN_USER_MENU_ROUTES,
  PLUGIN_AUDIT,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { InsightsLink } from "./components/InsightsLink";
import { getUserMenuRotes } from "./routes";
import { isAuditDb } from "./utils";

if (hasPremiumFeature("audit_app")) {
  PLUGIN_ADMIN_USER_MENU_ITEMS.push(user => [
    {
      title: t`Unsubscribe from all subscriptions / alerts`,
      link: `/admin/people/${user.id}/unsubscribe`,
    },
  ]);

  PLUGIN_ADMIN_USER_MENU_ROUTES.push(getUserMenuRotes);

  PLUGIN_AUDIT.isAuditDb = isAuditDb;

  PLUGIN_AUDIT.InsightsLink = InsightsLink;
}
