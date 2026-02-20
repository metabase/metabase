import type { Store } from "@reduxjs/toolkit";
import type { Location } from "history";
import {
  Navigate,
  Outlet,
  type RouteObject,
  useParams,
} from "react-router-dom";

import AdminApp from "metabase/admin/app/components/AdminApp";
import { getAdminPaths } from "metabase/admin/app/selectors";
import { DatabaseEditApp } from "metabase/admin/databases/containers/DatabaseEditApp";
import { DatabaseListApp } from "metabase/admin/databases/containers/DatabaseListApp";
import { DatabasePage } from "metabase/admin/databases/containers/DatabasePage";
import { RevisionHistoryApp } from "metabase/admin/datamodel/containers/RevisionHistoryApp";
import { SegmentApp } from "metabase/admin/datamodel/containers/SegmentApp";
import { SegmentListApp } from "metabase/admin/datamodel/containers/SegmentListApp";
import { AdminEmbeddingApp } from "metabase/admin/embedding/containers/AdminEmbeddingApp";
import { AdminPeopleApp } from "metabase/admin/people/containers/AdminPeopleApp";
import { EditUserModal } from "metabase/admin/people/containers/EditUserModal";
import { GroupDetailApp } from "metabase/admin/people/containers/GroupDetailApp";
import { GroupsListingApp } from "metabase/admin/people/containers/GroupsListingApp";
import { NewUserModal } from "metabase/admin/people/containers/NewUserModal";
import { PeopleListingApp } from "metabase/admin/people/containers/PeopleListingApp";
import { UserActivationModal } from "metabase/admin/people/containers/UserActivationModal";
import { UserPasswordResetModal } from "metabase/admin/people/containers/UserPasswordResetModal";
import { UserSuccessModal } from "metabase/admin/people/containers/UserSuccessModal";
import { ModelPersistenceConfiguration } from "metabase/admin/performance/components/ModelPersistenceConfiguration";
import { PerformanceApp } from "metabase/admin/performance/components/PerformanceApp";
import { StrategyEditorForDatabases } from "metabase/admin/performance/components/StrategyEditorForDatabases";
import { PerformanceTabId } from "metabase/admin/performance/types";
import { getAdminPermissionsRouteObjects } from "metabase/admin/permissions/routes";
import {
  EmbeddingSecuritySettings,
  EmbeddingSettings,
  GuestEmbedsSettings,
} from "metabase/admin/settings/components/EmbeddingSettings";
import { getSettingsRouteObjects } from "metabase/admin/settingsRoutes";
import { Help } from "metabase/admin/tools/components/Help";
import { JobInfoApp } from "metabase/admin/tools/components/JobInfoApp";
import { JobTriggersModal } from "metabase/admin/tools/components/JobTriggersModal";
import { LogLevelsModal } from "metabase/admin/tools/components/LogLevelsModal";
import { Logs } from "metabase/admin/tools/components/Logs";
import {
  ModelCachePage,
  ModelCacheRefreshJobModal,
} from "metabase/admin/tools/components/ModelCacheRefreshJobs";
import { ToolsApp } from "metabase/admin/tools/components/ToolsApp";
import { ToolsUpsell } from "metabase/admin/tools/components/ToolsUpsell";
import { getTasksRouteObjects } from "metabase/admin/tools/routes";
import { EmbeddingHubAdminSettingsPage } from "metabase/embedding/embedding-hub";
import { useSelector } from "metabase/lib/redux";
import { DataModelV1 } from "metabase/metadata/pages/DataModelV1";
import {
  PLUGIN_ADMIN_TOOLS,
  PLUGIN_CACHING,
  PLUGIN_DEPENDENCIES,
  PLUGIN_SUPPORT,
} from "metabase/plugins";
import {
  IsAdminGuard,
  UserCanAccessSettingsGuard,
  createModalRoute,
  useCompatLocation,
} from "metabase/routing/compat";
import { getSetting } from "metabase/selectors/settings";
import { getTokenFeature } from "metabase/setup";
import type { State } from "metabase-types/store";

type SectionKey =
  | "databases"
  | "data-model"
  | "people"
  | "embedding"
  | "settings"
  | "performance"
  | "tools";

const AdminToolsComponent = PLUGIN_ADMIN_TOOLS.COMPONENT || ToolsUpsell;

const AdminAppWithOutlet = () => (
  <AdminApp>
    <Outlet />
  </AdminApp>
);

const AdminEmbeddingAppWithOutlet = () => (
  <AdminEmbeddingApp>
    <Outlet />
  </AdminEmbeddingApp>
);

const AdminPeopleAppWithOutlet = () => (
  <AdminPeopleApp>
    <Outlet />
  </AdminPeopleApp>
);

const PeopleListingAppWithOutlet = () => (
  <PeopleListingApp>
    <Outlet />
  </PeopleListingApp>
);

const PerformanceAppWithOutlet = () => (
  <PerformanceApp>
    <Outlet />
  </PerformanceApp>
);

const ToolsAppWithOutlet = () => {
  const location = useCompatLocation();

  return (
    <ToolsApp location={location as unknown as Location}>
      <Outlet />
    </ToolsApp>
  );
};

const DatabasePageWithParams = () => {
  const params = useParams<{ databaseId?: string }>();
  return <DatabasePage params={{ databaseId: params.databaseId ?? "" }} />;
};

const DatabaseEditAppWithParams = () => {
  const params = useParams<{ databaseId: string }>();
  return (
    <DatabaseEditApp params={{ databaseId: params.databaseId ?? "" }}>
      <Outlet />
    </DatabaseEditApp>
  );
};

const SegmentAppWithParams = () => {
  const params = useParams<{ id?: string }>();
  return <SegmentApp params={{ id: params.id ?? "" }} />;
};

const RevisionHistoryAppWithParams = () => {
  const params = useParams<{ id: string }>();
  return <RevisionHistoryApp params={{ id: params.id ?? "" }} />;
};

const GroupDetailAppWithParams = () => {
  const params = useParams<{ groupId: string }>();
  return (
    <GroupDetailApp params={{ groupId: parseInt(params.groupId ?? "0", 10) }} />
  );
};

const EditUserModalWithParams = ({ onClose }: { onClose: () => void }) => {
  const params = useParams<{ userId: string }>();
  return (
    <EditUserModal onClose={onClose} params={{ userId: params.userId ?? "" }} />
  );
};

const UserSuccessModalWithParams = () => {
  const params = useParams<{ userId: string }>();
  return <UserSuccessModal params={{ userId: params.userId ?? "" }} />;
};

const UserPasswordResetModalWithParams = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const params = useParams<{ userId: string }>();
  return (
    <UserPasswordResetModal
      onClose={onClose}
      params={{ userId: params.userId ?? "" }}
    />
  );
};

const UserActivationModalWithParams = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const params = useParams<{ userId: string }>();
  return (
    <UserActivationModal
      onClose={onClose}
      params={{ userId: params.userId ?? "" }}
    />
  );
};

const ModelCacheRefreshJobModalWithParams = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const params = useParams<{ jobId: string }>();
  return (
    <ModelCacheRefreshJobModal
      onClose={onClose}
      params={{ jobId: params.jobId ?? "" }}
    />
  );
};

const JobTriggersModalWithParams = ({ onClose }: { onClose: () => void }) => {
  const params = useParams<{ jobKey: string }>();
  return (
    <JobTriggersModal
      onClose={onClose}
      params={{ jobKey: params.jobKey ?? "" }}
    />
  );
};

const DataModelV1WithRouteProps = () => {
  const location = useCompatLocation();
  const params = useParams<{
    databaseId?: string;
    schemaId?: string;
    tableId?: string;
    fieldId?: string;
    section?: string;
  }>();

  return <DataModelV1 location={location} params={params} />;
};

const RedirectToAllowedSettingsV7 = () => {
  const adminItems = useSelector(getAdminPaths) ?? [];

  return (
    <Navigate
      to={adminItems.length === 0 ? "/unauthorized" : adminItems[0].path}
      replace
    />
  );
};

const AdminSectionGuard = ({ routeKey }: { routeKey: SectionKey }) => {
  const adminPaths = useSelector(getAdminPaths);
  const hasAccess = adminPaths?.some((path) => path.key === routeKey) ?? false;

  if (!hasAccess) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
};

const TenantsGuard = () => {
  const adminPaths = useSelector(getAdminPaths);
  const useTenants = useSelector((state: State) =>
    getSetting(state, "use-tenants"),
  );

  const canAccessPeople =
    adminPaths?.some((path) => path.key === "people") ?? false;
  if (!canAccessPeople || !useTenants) {
    return <Navigate to="/admin/people" replace />;
  }

  return <Outlet />;
};

export function getAdminRouteObjects(store: Store<State>): RouteObject[] {
  const hasSimpleEmbedding = getTokenFeature(
    store.getState(),
    "embedding_simple",
  );

  return [
    {
      path: "/admin",
      element: <UserCanAccessSettingsGuard />,
      children: [
        {
          element: <AdminAppWithOutlet />,
          children: [
            { index: true, element: <RedirectToAllowedSettingsV7 /> },
            {
              path: "databases",
              element: <AdminSectionGuard routeKey="databases" />,
              children: [
                {
                  index: true,
                  element: (
                    <DatabaseListApp>
                      <Outlet />
                    </DatabaseListApp>
                  ),
                },
                {
                  path: "create",
                  element: (
                    <IsAdminGuard>
                      <DatabasePageWithParams />
                    </IsAdminGuard>
                  ),
                },
                {
                  path: ":databaseId/edit",
                  element: <DatabasePageWithParams />,
                },
                { path: ":databaseId", element: <DatabaseEditAppWithParams /> },
              ],
            },
            {
              path: "datamodel",
              element: <AdminSectionGuard routeKey="data-model" />,
              children: [
                { index: true, element: <Navigate to="database" replace /> },
                { path: "database", element: <DataModelV1WithRouteProps /> },
                {
                  path: "database/:databaseId",
                  element: <DataModelV1WithRouteProps />,
                },
                {
                  path: "database/:databaseId/schema/:schemaId",
                  element: <DataModelV1WithRouteProps />,
                },
                {
                  path: "database/:databaseId/schema/:schemaId/table/:tableId",
                  element: <DataModelV1WithRouteProps />,
                },
                {
                  path: "database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId",
                  element: <DataModelV1WithRouteProps />,
                },
                { path: "segments", element: <SegmentListApp /> },
                {
                  path: "segment/create",
                  element: (
                    <IsAdminGuard>
                      <SegmentAppWithParams />
                    </IsAdminGuard>
                  ),
                },
                {
                  path: "segment/:id",
                  element: (
                    <IsAdminGuard>
                      <SegmentAppWithParams />
                    </IsAdminGuard>
                  ),
                },
                {
                  path: "segment/:id/revisions",
                  element: <RevisionHistoryAppWithParams />,
                },
                {
                  path: "database/:databaseId/schema/:schemaId/table/:tableId/settings",
                  element: <Navigate to=".." replace relative="path" />,
                },
                {
                  path: "database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId/:section",
                  element: <Navigate to=".." replace relative="path" />,
                },
              ],
            },
            {
              path: "people",
              element: <AdminSectionGuard routeKey="people" />,
              children: [
                {
                  element: <AdminPeopleAppWithOutlet />,
                  children: [
                    { index: true, element: <PeopleListingApp /> },
                    {
                      path: "groups",
                      children: [
                        { index: true, element: <GroupsListingApp /> },
                        {
                          path: ":groupId",
                          element: <GroupDetailAppWithParams />,
                        },
                      ],
                    },
                    {
                      path: "tenants",
                      element: <TenantsGuard />,
                      children: [
                        {
                          path: "*",
                          element: <Navigate to="/admin/people" replace />,
                        },
                      ],
                    },
                    {
                      element: <PeopleListingAppWithOutlet />,
                      children: [
                        createModalRoute("new", NewUserModal, { noWrap: true }),
                      ],
                    },
                    {
                      path: ":userId",
                      element: <PeopleListingAppWithOutlet />,
                      children: [
                        {
                          index: true,
                          element: <Navigate to="/admin/people" replace />,
                        },
                        createModalRoute("edit", EditUserModalWithParams, {
                          noWrap: true,
                        }),
                        {
                          path: "success",
                          element: <UserSuccessModalWithParams />,
                        },
                        createModalRoute(
                          "reset",
                          UserPasswordResetModalWithParams,
                          { noWrap: true },
                        ),
                        createModalRoute(
                          "deactivate",
                          UserActivationModalWithParams,
                          { noWrap: true },
                        ),
                        createModalRoute(
                          "reactivate",
                          UserActivationModalWithParams,
                          { noWrap: true },
                        ),
                      ],
                    },
                  ],
                },
              ],
            },
            {
              path: "embedding",
              element: <AdminSectionGuard routeKey="embedding" />,
              children: [
                {
                  element: <AdminEmbeddingAppWithOutlet />,
                  children: [
                    { index: true, element: <EmbeddingSettings /> },
                    {
                      path: "setup-guide",
                      element: <EmbeddingHubAdminSettingsPage />,
                    },
                    ...(hasSimpleEmbedding
                      ? [
                          { path: "guest", element: <GuestEmbedsSettings /> },
                          {
                            path: "security",
                            element: <EmbeddingSecuritySettings />,
                          },
                        ]
                      : [
                          {
                            path: "guest",
                            element: <Navigate to="/admin/embedding" replace />,
                          },
                          {
                            path: "security",
                            element: <Navigate to="/admin/embedding" replace />,
                          },
                        ]),
                  ],
                },
              ],
            },
            {
              path: "settings",
              element: <AdminSectionGuard routeKey="settings" />,
              children: getSettingsRouteObjects(),
            },
            {
              path: "permissions",
              element: (
                <IsAdminGuard>
                  <Outlet />
                </IsAdminGuard>
              ),
              children: getAdminPermissionsRouteObjects(),
            },
            {
              path: "performance",
              element: <AdminSectionGuard routeKey="performance" />,
              children: [
                {
                  element: <PerformanceAppWithOutlet />,
                  children: [
                    {
                      index: true,
                      element: (
                        <Navigate to={PerformanceTabId.Databases} replace />
                      ),
                    },
                    {
                      path: "databases",
                      element: <StrategyEditorForDatabases />,
                    },
                    {
                      path: "models",
                      element: <ModelPersistenceConfiguration />,
                    },
                    ...(PLUGIN_CACHING.isGranularCachingEnabled()
                      ? [
                          {
                            path: "dashboards-and-questions",
                            element: (
                              <PLUGIN_CACHING.StrategyEditorForQuestionsAndDashboards />
                            ),
                          },
                        ]
                      : []),
                  ],
                },
              ],
            },
            {
              path: "tools",
              element: <AdminSectionGuard routeKey="tools" />,
              children: [
                {
                  element: <ToolsAppWithOutlet />,
                  children: [
                    { index: true, element: <Navigate to="help" replace /> },
                    {
                      path: "errors",
                      element: <AdminToolsComponent />,
                    },
                    {
                      path: "model-caching",
                      element: <ModelCachePage />,
                      children: [
                        createModalRoute(
                          ":jobId",
                          ModelCacheRefreshJobModalWithParams,
                        ),
                      ],
                    },
                    {
                      path: "help",
                      element: <Help />,
                      children: PLUGIN_SUPPORT.isEnabled
                        ? [
                            createModalRoute(
                              "grant-access",
                              PLUGIN_SUPPORT.GrantAccessModal,
                            ),
                          ]
                        : [],
                    },
                    {
                      path: "tasks",
                      children: getTasksRouteObjects(),
                    },
                    {
                      path: "jobs",
                      element: <JobInfoApp />,
                      children: [
                        createModalRoute(
                          ":jobKey",
                          JobTriggersModalWithParams,
                          {
                            modalProps: { wide: true },
                          },
                        ),
                      ],
                    },
                    {
                      path: "logs",
                      element: <Logs />,
                      children: [
                        createModalRoute("levels", LogLevelsModal, {
                          modalProps: { disableEventSandbox: true },
                        }),
                      ],
                    },
                    ...(PLUGIN_DEPENDENCIES.isEnabled
                      ? [
                          {
                            path: "dependencies",
                            element: (
                              <PLUGIN_DEPENDENCIES.DependencyGraphPage />
                            ),
                          },
                        ]
                      : []),
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      path: "/admin/embedding/modular",
      element: <Navigate to="/admin/embedding" replace />,
    },
    {
      path: "/admin/embedding/interactive",
      element: <Navigate to="/admin/embedding" replace />,
    },
    {
      path: "/admin/settings/embedding-in-other-applications",
      element: <Navigate to="/admin/embedding" replace />,
    },
    {
      path: "/admin/settings/embedding-in-other-applications/full-app",
      element: <Navigate to="/admin/embedding" replace />,
    },
    {
      path: "/admin/settings/embedding-in-other-applications/standalone",
      element: <Navigate to="/admin/embedding/guest" replace />,
    },
    {
      path: "/admin/settings/embedding-in-other-applications/sdk",
      element: <Navigate to="/admin/embedding" replace />,
    },
  ];
}
