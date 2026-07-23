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

// The permissions page renders at each drill-down depth with progressively more
// params. v3 expressed this with sequential optional groups
// (`database(/:databaseId)(/schema/:schemaName)`), which v7's matcher cannot
// parse, so each depth is spelled out as its own route. One route matches per
// URL, exactly as the optional groups did.
const DATABASES_PERMISSIONS_PATHS = [
  "database",
  "database/:databaseId",
  "database/:databaseId/schema/:schemaName",
  "database/:databaseId/schema/:schemaName/table/:tableId",
];

const GROUPS_PERMISSIONS_PATHS = [
  "group",
  "group/:groupId",
  "group/:groupId/database/:databaseId",
  "group/:groupId/database/:databaseId/schema/:schemaName",
];

const getRoutes = () => (
  <Route>
    <Route index element={redirect("data")} />

    <Route path="data" element={<RoutedDataPermissionsPage />}>
      <Route index element={redirect("group")} />

      {DATABASES_PERMISSIONS_PATHS.map((path) => (
        <Route
          key={path}
          path={path}
          element={<RoutedDatabasesPermissionsPage />}
        >
          {PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES}
          {PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES}
        </Route>
      ))}

      {GROUPS_PERMISSIONS_PATHS.map((path) => (
        <Route key={path} path={path} element={<RoutedGroupsPermissionsPage />}>
          {PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES}
          {PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES}
        </Route>
      ))}
    </Route>

    <Route path="collections" element={<RoutedCollectionPermissionsPage />}>
      <Route path=":collectionId" />
    </Route>

    {PLUGIN_ADMIN_PERMISSIONS_TABS.getRoutes()}
    {PLUGIN_APPLICATION_PERMISSIONS.getRoutes()}
  </Route>
);

export { getRoutes };
