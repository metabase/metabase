import type { ReactNode } from "react";
import {
  Navigate,
  Outlet,
  type RouteObject,
  useParams,
} from "react-router-dom";

import {
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABS,
  PLUGIN_APPLICATION_PERMISSIONS,
} from "metabase/plugins";
import { IndexRedirect, Route } from "metabase/routing/compat/react-router-v3";

import { CollectionPermissionsPage } from "./pages/CollectionPermissionsPage/CollectionPermissionsPage";
import DataPermissionsPage from "./pages/DataPermissionsPage";
import { DatabasesPermissionsPage } from "./pages/DatabasePermissionsPage/DatabasesPermissionsPage";
import { GroupsPermissionsPage } from "./pages/GroupDataPermissionsPage/GroupsPermissionsPage";

export const getRoutes = () => (
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

const PermissionsLayoutWithOutlet = () => <Outlet />;

const DataPermissionsWithOutlet = () => (
  <DataPermissionsPageWithParams>
    <Outlet />
  </DataPermissionsPageWithParams>
);

const DataPermissionsPageWithParams = ({
  children,
}: {
  children: ReactNode;
}) => {
  const params = useParams<{
    databaseId?: string;
  }>();

  return (
    <DataPermissionsPage params={params as unknown as { databaseId?: number }}>
      {children}
    </DataPermissionsPage>
  );
};

const DatabasesPermissionsPageWithParams = () => {
  const params = useParams<{
    databaseId?: string;
    schemaName?: string;
    tableId?: string;
  }>();

  return <DatabasesPermissionsPage params={params} />;
};

const GroupsPermissionsPageWithParams = () => {
  const params = useParams<{
    groupId?: string;
    databaseId?: string;
    schemaName?: string;
  }>();

  return <GroupsPermissionsPage params={params} />;
};

const CollectionPermissionsPageWithParams = () => {
  const params = useParams<{ collectionId?: string }>();

  return (
    <CollectionPermissionsPage
      params={params as unknown as { collectionId?: number }}
    />
  );
};

export const getAdminPermissionsRouteObjects = (): RouteObject[] => [
  {
    element: <PermissionsLayoutWithOutlet />,
    children: [
      { index: true, element: <Navigate to="data" replace /> },
      {
        path: "data",
        element: <DataPermissionsWithOutlet />,
        children: [
          { index: true, element: <Navigate to="group" replace /> },
          {
            path: "database",
            element: <DatabasesPermissionsPageWithParams />,
          },
          {
            path: "database/:databaseId",
            element: <DatabasesPermissionsPageWithParams />,
          },
          {
            path: "database/:databaseId/schema/:schemaName",
            element: <DatabasesPermissionsPageWithParams />,
          },
          {
            path: "database/:databaseId/schema/:schemaName/table/:tableId",
            element: <DatabasesPermissionsPageWithParams />,
          },
          {
            path: "group",
            element: <GroupsPermissionsPageWithParams />,
          },
          {
            path: "group/:groupId",
            element: <GroupsPermissionsPageWithParams />,
          },
          {
            path: "group/:groupId/database/:databaseId",
            element: <GroupsPermissionsPageWithParams />,
          },
          {
            path: "group/:groupId/database/:databaseId/schema/:schemaName",
            element: <GroupsPermissionsPageWithParams />,
          },
        ],
      },
      {
        path: "collections",
        element: <CollectionPermissionsPageWithParams />,
      },
      {
        path: "collections/:collectionId",
        element: <CollectionPermissionsPageWithParams />,
      },
    ],
  },
];
