import { Route } from "react-router";
import { t } from "ttag";

import { PLUGIN_TRANSFORMS } from "metabase/plugins";

PLUGIN_TRANSFORMS.getAdminPaths = () => [
  { key: "transforms", name: t`Transforms`, path: "/admin/transforms" },
];

PLUGIN_TRANSFORMS.getAdminRoutes = (isAdmin) => (
  <Route path="transforms" component={isAdmin} />
);
