import { PLUGIN_ADMIN_NAV_ITEMS, PLUGIN_ADMIN_ROUTES } from "metabase/plugins";

import { hasPremiumFeature } from "metabase-enterprise/settings";
import { t } from "ttag";

import getAuditRoutes from "./routes";

if (hasPremiumFeature("audit_app")) {
  PLUGIN_ADMIN_NAV_ITEMS.push({ name: t`Audit`, path: "/admin/audit" });
  PLUGIN_ADMIN_ROUTES.push(getAuditRoutes);
}
