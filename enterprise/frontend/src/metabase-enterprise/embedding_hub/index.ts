import { t } from "ttag";

import { PLUGIN_ADMIN_NAV_ITEMS, PLUGIN_ADMIN_ROUTES } from "metabase/plugins";

import { getRoutes } from "./routes";

// Don't know why this gives a ts error
PLUGIN_ADMIN_ROUTES.push(getRoutes);
PLUGIN_ADMIN_NAV_ITEMS.push({
  name: t`Embedding`,
  path: "admin/embedding",
  key: "embedding",
});
