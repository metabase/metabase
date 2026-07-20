import {
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABS,
  PLUGIN_APPLICATION_PERMISSIONS,
} from "metabase/plugins";
import { Route, redirect, withRouteProps } from "metabase/router";

import { CollectionPermissionsPage } from "./pages/CollectionPermissionsPage/CollectionPermissionsPage";
import DataPermissionsPage from "./pages/DataPermissionsPage";
import { DatabasesPermissionsPage } from "./pages/DatabasePermissionsPage/DatabasesPermissionsPage";
import { GroupsPermissionsPage } from "./pages/GroupDataPermissionsPage/GroupsPermissionsPage";

const RoutedDataPermissionsPage = withRouteProps(DataPermissionsPage);
const RoutedDatabasesPermissionsPage = withRouteProps(DatabasesPermissionsPage);
const RoutedGroupsPermissionsPage = withRouteProps(GroupsPermissionsPage);
const RoutedCollectionPermissionsPage = withRouteProps(
  CollectionPermissionsPage,
);

const getRoutes = () => (
  <Route>
    <Route index element={redirect("data")} />

    <Route path="data" element={<RoutedDataPermissionsPage />}>
      <Route index element={redirect("group")} />

      <Route
        path="database(/:databaseId)(/schema/:schemaName)(/table/:tableId)"
        element={<RoutedDatabasesPermissionsPage />}
      >
        {PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES}
        {PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES}
      </Route>

      <Route
        path="group(/:groupId)(/database/:databaseId)(/schema/:schemaName)"
        element={<RoutedGroupsPermissionsPage />}
      >
        {PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES}
        {PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES}
      </Route>
    </Route>

    <Route path="collections" element={<RoutedCollectionPermissionsPage />}>
      <Route path=":collectionId" />
    </Route>

    {PLUGIN_ADMIN_PERMISSIONS_TABS.getRoutes()}
    {PLUGIN_APPLICATION_PERMISSIONS.getRoutes()}
  </Route>
);

export { getRoutes };
