import { PLUGIN_ADMIN_ROUTES } from "metabase/plugins";

import { getRoutes } from "./routes";

// Don't know why this gives a ts error
PLUGIN_ADMIN_ROUTES.push(getRoutes);
