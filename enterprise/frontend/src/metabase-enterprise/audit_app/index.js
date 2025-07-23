import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import {
  PLUGIN_ADMIN_USER_MENU_ITEMS,
  PLUGIN_ADMIN_USER_MENU_ROUTES,
  PLUGIN_AUDIT,
} from "metabase/plugins";
import { Menu } from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { InsightsLink } from "./components/InsightsLink";
import { getUserMenuRotes } from "./routes";
import { isAuditDb } from "./utils";

if (hasPremiumFeature("audit_app")) {
  PLUGIN_ADMIN_USER_MENU_ITEMS.push((user) => [
    <Menu.Item
      component={ForwardRefLink}
      to={`/admin/people/${user.id}/unsubscribe`}
      key="unsubscribe"
    >
      {t`Unsubscribe from all subscriptions / alerts`}
    </Menu.Item>,
  ]);

  PLUGIN_ADMIN_USER_MENU_ROUTES.push(getUserMenuRotes);

  PLUGIN_AUDIT.isAuditDb = isAuditDb;

  PLUGIN_AUDIT.InsightsLink = InsightsLink;
}
