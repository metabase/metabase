import { t } from "ttag";

import { PLUGIN_ADMIN_NAV_ITEMS, PLUGIN_ADMIN_ROUTES } from "metabase/plugins";

import getRoutes from "./routes";

PLUGIN_ADMIN_NAV_ITEMS.push({ name: t`Enterprise`, path: "/admin/store" });
PLUGIN_ADMIN_ROUTES.push(getRoutes);
