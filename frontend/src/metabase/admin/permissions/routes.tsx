import { IndexRedirect, Route } from "react-router";

import {
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABS,
  PLUGIN_APPLICATION_PERMISSIONS,
} from "metabase/plugins";

import { CollectionPermissionsPage } from "./pages/CollectionPermissionsPage/CollectionPermissionsPage";
import DataPermissionsPage from "./pages/DataPermissionsPage";
import { DatabasesPermissionsPage } from "./pages/DatabasePermissionsPage/DatabasesPermissionsPage";
import { GroupsPermissionsPage } from "./pages/GroupDataPermissionsPage/GroupsPermissionsPage";

const getRoutes = () => (
  <Route>
    <IndexRedirect to="data" />

    <Route path="data" component={DataPermissionsPage}>
      <IndexRedirect to="group" />

      <Route
        path="database(/:databaseId)(/schema/:schemaName)(/table/:tableId)"
        component={DatabasesPermissionsPage}
      >
        {PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES}
        {PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES}
      </Route>

      <Route
        path="group(/:groupId)(/database/:databaseId)(/schema/:schemaName)"
        component={GroupsPermissionsPage}
      >
        {PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES}
        {PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES}
      </Route>
    </Route>

    <Route path="collections" component={CollectionPermissionsPage}>
      <Route path=":collectionId" />
    </Route>

    {PLUGIN_ADMIN_PERMISSIONS_TABS.getRoutes()}
    {PLUGIN_APPLICATION_PERMISSIONS.getRoutes()}
  </Route>
);

export { getRoutes };
