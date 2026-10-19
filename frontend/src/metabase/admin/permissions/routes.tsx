import {
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABS,
  PLUGIN_APPLICATION_PERMISSIONS,
} from "metabase/plugins";
import { Route, redirect } from "metabase/router";

/**
 * The permissions pages, in one chunk of their own.
 *
 * They are only ever reached from these routes and are always used together, so
 * they share a chunk. It is theirs rather than the admin one: naming an
 * `import()` into a chunk another site already names merges the two module sets,
 * which copies whatever they shared into every other chunk that needs it.
 */
const dataPermissions = () =>
  import(
    /* webpackChunkName: "admin-permissions" */ "./pages/DataPermissionsPage"
  ).then(({ DataPermissionsPage }) => ({ Component: DataPermissionsPage }));

const databasesPermissions = () =>
  import(
    /* webpackChunkName: "admin-permissions" */ "./pages/DatabasePermissionsPage/DatabasesPermissionsPage"
  ).then(({ DatabasesPermissionsPage }) => ({
    Component: DatabasesPermissionsPage,
  }));

const groupsPermissions = () =>
  import(
    /* webpackChunkName: "admin-permissions" */ "./pages/GroupDataPermissionsPage/GroupsPermissionsPage"
  ).then(({ GroupsPermissionsPage }) => ({ Component: GroupsPermissionsPage }));

const collectionPermissions = () =>
  import(
    /* webpackChunkName: "admin-permissions" */ "./pages/CollectionPermissionsPage/CollectionPermissionsPage"
  ).then(({ CollectionPermissionsPage }) => ({
    Component: CollectionPermissionsPage,
  }));

// The permissions page renders at each drill-down depth with progressively more
// params. v3 expressed this with sequential optional groups
// (`database(/:databaseId)(/schema/:schemaName)`), which v7's matcher cannot
// parse, so each depth is spelled out as its own route. One route matches per
// URL, exactly as the optional groups did.
export const DATABASES_PERMISSIONS_PATHS = [
  "database",
  "database/:databaseId",
  // Databases with no schemas, such as MySQL or MongoDB, drill straight from
  // the database to the table.
  "database/:databaseId/table/:tableId",
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

    <Route path="data" lazy={dataPermissions}>
      <Route index element={redirect("group")} />

      {DATABASES_PERMISSIONS_PATHS.map((path) => (
        <Route key={path} path={path} lazy={databasesPermissions}>
          {PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES}
          {PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES}
        </Route>
      ))}

      {GROUPS_PERMISSIONS_PATHS.map((path) => (
        <Route key={path} path={path} lazy={groupsPermissions}>
          {PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES}
          {PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES}
        </Route>
      ))}
    </Route>

    <Route path="collections" lazy={collectionPermissions}>
      <Route path=":collectionId" />
    </Route>

    {PLUGIN_ADMIN_PERMISSIONS_TABS.getRoutes()}
    {PLUGIN_APPLICATION_PERMISSIONS.getRoutes()}
  </Route>
);

export { getRoutes };
