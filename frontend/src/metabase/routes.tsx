import type { Store, ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";

import { App } from "metabase/AppComponent";
import { getAccountRoutes } from "metabase/account/routes";
import CollectionPermissionsModal from "metabase/admin/permissions/components/CollectionPermissionsModal/CollectionPermissionsModal";
import { getRoutes as getAdminRoutes } from "metabase/admin/routes";
import { ForgotPassword } from "metabase/auth/components/ForgotPassword";
import { Login } from "metabase/auth/components/Login";
import { Logout } from "metabase/auth/components/Logout";
import { ResetPassword } from "metabase/auth/components/ResetPassword";
import { SsoReload } from "metabase/auth/components/SsoReload";
import {
  BrowseDatabases,
  BrowseMetrics,
  BrowseModels,
  BrowseSchemas,
  BrowseTables,
  TablePermalinkRedirect,
} from "metabase/browse";
import { ArchiveCollectionModal } from "metabase/collections/components/ArchiveCollectionModal";
import CollectionLanding from "metabase/collections/components/CollectionLanding";
import { MoveCollectionModal } from "metabase/collections/components/MoveCollectionModal";
import { TrashCollectionLanding } from "metabase/collections/components/TrashCollectionLanding";
import { Unauthorized } from "metabase/common/components/ErrorPages";
import { modalRoute } from "metabase/common/components/ModalRoute";
import { MoveQuestionsIntoDashboardsModal } from "metabase/common/components/MoveQuestionsIntoDashboardsModal";
import { NotFoundFallbackPage } from "metabase/common/components/NotFoundFallbackPage";
import { UnsubscribePage } from "metabase/common/components/Unsubscribe";
import { UserCollectionList } from "metabase/common/components/UserCollectionList";
import { DashboardCopyModalConnected } from "metabase/dashboard/components/DashboardCopyModal";
import { DashboardMoveModalConnected } from "metabase/dashboard/components/DashboardMoveModal";
import { ArchiveDashboardModalConnected } from "metabase/dashboard/containers/ArchiveDashboardModal";
import { AutomaticDashboardApp } from "metabase/dashboard/containers/AutomaticDashboardApp";
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { getDataStudioRoutes } from "metabase/data-studio/routes";
import { TableDetailPage } from "metabase/detail-view/pages/TableDetailPage";
import { CommentsSidesheet } from "metabase/documents/components/CommentsSidesheet";
import { DocumentPageOuter } from "metabase/documents/routes";
import { LandingPageRedirect } from "metabase/home/components/LandingPageRedirect";
import { Onboarding } from "metabase/home/components/Onboarding";
import { getMetabotRoutes } from "metabase/metabot/routes";
import { getMetricRoutes } from "metabase/metrics/routes";
import { MetricsViewerPage } from "metabase/metrics-viewer";
import NewModelOptions from "metabase/models/containers/NewModelOptions";
import { getRoutes as getModelRoutes } from "metabase/models/routes";
import { getMonitorRedirects, getMonitorRoutes } from "metabase/monitor/routes";
import {
  PLUGIN_COLLECTIONS,
  PLUGIN_DATA_APPS,
  PLUGIN_TABLE_EDITING,
  PLUGIN_TENANTS,
} from "metabase/plugins";
import { MetabotQueryBuilder } from "metabase/query_builder/components/MetabotQueryBuilder";
import { QuestionHashRedirect } from "metabase/query_builder/components/QuestionHashRedirect";
import { QueryBuilder } from "metabase/query_builder/containers/QueryBuilder";
import type { State } from "metabase/redux/store";
import DatabaseDetailContainer from "metabase/reference/databases/DatabaseDetailContainer";
import DatabaseListContainer from "metabase/reference/databases/DatabaseListContainer";
import FieldDetailContainer from "metabase/reference/databases/FieldDetailContainer";
import FieldListContainer from "metabase/reference/databases/FieldListContainer";
import TableDetailContainer from "metabase/reference/databases/TableDetailContainer";
import TableListContainer from "metabase/reference/databases/TableListContainer";
import TableQuestionsContainer from "metabase/reference/databases/TableQuestionsContainer";
import { GlossaryContainer } from "metabase/reference/glossary/GlossaryContainer";
import SegmentDetailContainer from "metabase/reference/segments/SegmentDetailContainer";
import SegmentFieldDetailContainer from "metabase/reference/segments/SegmentFieldDetailContainer";
import SegmentFieldListContainer from "metabase/reference/segments/SegmentFieldListContainer";
import SegmentListContainer from "metabase/reference/segments/SegmentListContainer";
import SegmentQuestionsContainer from "metabase/reference/segments/SegmentQuestionsContainer";
import SegmentRevisionsContainer from "metabase/reference/segments/SegmentRevisionsContainer";
import {
  CanAccessOnboarding,
  CanAccessSettings,
  IsAdmin,
  IsAuthenticated,
  IsNotAuthenticated,
} from "metabase/route-guards";
import {
  Navigate,
  type RouteObject,
  redirect,
  toRouteObjects,
  useParams,
} from "metabase/router";
import { SearchApp } from "metabase/search/containers/SearchApp";
import { RedirectIfSetup } from "metabase/setup/components/RedirectIfSetup";
import { Setup } from "metabase/setup/components/Setup";
import getCollectionTimelineRoutes from "metabase/timelines/collections/routes";

import { LoadCurrentUser } from "./LoadCurrentUser";
import { createEntityIdRedirect } from "./routes-stable-id-aware";

type AppStore = Store<State> & {
  dispatch: ThunkDispatch<State, void, UnknownAction>;
};

/**
 * v48 and earlier linked databases as `/browse/<dbId>-<slug>`. That was a
 * `:dbId-:slug` route, which react-router v7 cannot express: a dynamic segment
 * has to span the whole path segment. Match the segment as a whole instead, and
 * only redirect when it has the legacy hyphenated shape, so anything else still
 * falls through to the not-found page rather than being sent to a database that
 * cannot exist.
 */
export function LegacyBrowseRedirect() {
  const { dbIdAndSlug } = useParams();

  if (!dbIdAndSlug?.includes("-")) {
    return <NotFoundFallbackPage />;
  }

  return <Navigate to={`/browse/databases/${dbIdAndSlug}`} replace />;
}

export const getRoutes = (store: AppStore): RouteObject[] => [
  {
    element: <App />,
    children: [
      // SETUP
      {
        element: <RedirectIfSetup />,
        children: [{ path: "/setup", element: <Setup /> }],
      },

      // For compatibility: use the standard setup for embedding
      { path: "/setup/embedding", element: redirect("/setup") },

      // APP
      {
        element: <LoadCurrentUser />,
        children: [
          // AUTH
          {
            path: "/auth",
            children: [
              { index: true, element: redirect("/auth/login") },
              {
                element: <IsNotAuthenticated />,
                children: [
                  { path: "login", element: <Login /> },
                  { path: "login/:provider", element: <Login /> },
                ],
              },
              { path: "logout", element: <Logout /> },
              { path: "forgot_password", element: <ForgotPassword /> },
              { path: "reset_password/:token", element: <ResetPassword /> },
              // FE routes can sometimes be prioritized over BE
              // reloading will correctly pick the SSO flow back up from the BE
              { path: "sso", element: <SsoReload /> },
              { path: "sso/:provider", element: <SsoReload /> },
            ],
          },

          // MAIN
          {
            element: <IsAuthenticated />,
            children: [
              ...toRouteObjects(getMetabotRoutes()),

              ...(PLUGIN_DATA_APPS.isEnabled
                ? toRouteObjects(PLUGIN_DATA_APPS.getRoutes())
                : []),

              // The global all hands routes, things in here are for all the folks
              { path: "/", element: <LandingPageRedirect /> },

              {
                path: "getting-started",
                element: <CanAccessOnboarding />,
                children: [{ index: true, element: <Onboarding /> }],
              },

              { path: "search", element: <SearchApp /> },
              // Send historical /archive route to trash - can remove in v52
              { path: "archive", element: redirect("../trash") },
              { path: "trash", element: <TrashCollectionLanding /> },

              {
                path: "document/:entityId",
                element: <DocumentPageOuter />,
                children: toRouteObjects(
                  modalRoute("comments/:childTargetId", CommentsSidesheet, {
                    noWrap: true,
                  }),
                ),
              },

              {
                path: "collection/entity/:entity_id/*",
                element: createEntityIdRedirect({
                  parametersToTranslate: [
                    {
                      name: "entity_id",
                      resourceType: "collection",
                      type: "param",
                    },
                  ],
                }),
              },

              {
                path: "collection/users",
                element: <IsAdmin />,
                children: [{ index: true, element: <UserCollectionList /> }],
              },

              {
                path: "collection/tenant-specific",
                element: <PLUGIN_TENANTS.CanAccessTenantSpecificRoute />,
                children: [
                  {
                    index: true,
                    element: <PLUGIN_TENANTS.TenantCollectionList />,
                  },
                ],
              },

              {
                path: "collection/tenant-users",
                element: <IsAdmin />,
                children: [
                  { index: true, element: <PLUGIN_TENANTS.TenantUsersList /> },
                  {
                    path: ":tenantId",
                    element: (
                      <PLUGIN_TENANTS.TenantUsersPersonalCollectionList />
                    ),
                  },
                ],
              },

              {
                path: "collection/:slug",
                element: <CollectionLanding />,
                children: toRouteObjects(
                  <>
                    {modalRoute("move", MoveCollectionModal, { noWrap: true })}
                    {modalRoute("archive", ArchiveCollectionModal, {
                      noWrap: true,
                    })}
                    {modalRoute("permissions", CollectionPermissionsModal)}
                    {modalRoute(
                      "move-questions-dashboard",
                      MoveQuestionsIntoDashboardsModal,
                    )}
                    {PLUGIN_COLLECTIONS.cleanUpRoute}
                    {getCollectionTimelineRoutes()}
                  </>,
                ),
              },

              {
                path: "dashboard/entity/:entity_id/*",
                element: createEntityIdRedirect({
                  parametersToTranslate: [
                    {
                      name: "entity_id",
                      resourceType: "dashboard",
                      type: "param",
                    },
                    {
                      name: "tab",
                      resourceType: "dashboard-tab",
                      type: "search",
                    },
                  ],
                }),
              },

              {
                path: "dashboard/:slug",
                element: <DashboardApp />,
                children: toRouteObjects(
                  <>
                    {modalRoute("move", DashboardMoveModalConnected, {
                      noWrap: true,
                    })}
                    {modalRoute("copy", DashboardCopyModalConnected, {
                      noWrap: true,
                    })}
                    {modalRoute("archive", ArchiveDashboardModalConnected, {
                      noWrap: true,
                    })}
                  </>,
                ),
              },

              {
                path: "/question",
                children: [
                  {
                    path: "/question/entity/:entity_id/*",
                    element: createEntityIdRedirect({
                      parametersToTranslate: [
                        {
                          name: "entity_id",
                          resourceType: "card",
                          type: "param",
                        },
                      ],
                    }),
                  },
                  { index: true, element: <QueryBuilder /> },
                  { path: "notebook", element: <QueryBuilder /> },
                  { path: "ask", element: <MetabotQueryBuilder /> },
                  { path: ":slug", element: <QueryBuilder /> },
                  { path: ":slug/notebook", element: <QueryBuilder /> },
                  { path: ":slug/metabot", element: <QueryBuilder /> },
                  { path: ":slug/:objectId", element: <QueryBuilder /> },
                ],
              },

              // MODELS
              ...toRouteObjects(getModelRoutes()),

              {
                path: "/model",
                children: [
                  { index: true, element: <QueryBuilder /> },
                  { path: "new", element: <NewModelOptions /> },
                  { path: ":slug", element: <QueryBuilder /> },
                  { path: ":slug/notebook", element: <QueryBuilder /> },
                  { path: ":slug/query", element: <QueryBuilder /> },
                  { path: ":slug/columns", element: <QueryBuilder /> },
                  { path: ":slug/metadata", element: <QueryBuilder /> },
                  { path: ":slug/metabot", element: <QueryBuilder /> },
                  { path: ":slug/:objectId", element: <QueryBuilder /> },
                  { path: "query", element: <QueryBuilder /> },
                  { path: "metabot", element: <QueryBuilder /> },
                ],
              },

              ...toRouteObjects(getMetricRoutes()),

              {
                path: "browse",
                children: [
                  { index: true, element: redirect("/browse/models") },
                  { path: "metrics", element: <BrowseMetrics /> },
                  { path: "models", element: <BrowseModels /> },
                  { path: "databases", element: <BrowseDatabases /> },
                  { path: "databases/:slug", element: <BrowseSchemas /> },
                  {
                    path: "databases/:dbId/schema/:schemaName",
                    element: <BrowseTables />,
                  },
                  {
                    path: "databases/:dbName/schema/:schemaName/table/:tableName",
                    element: <TablePermalinkRedirect />,
                  },
                  {
                    path: "databases/:dbName/table/:tableName",
                    element: <TablePermalinkRedirect />,
                  },

                  ...toRouteObjects(PLUGIN_TABLE_EDITING.getRoutes()),

                  // These two redirects support legacy paths in v48 and earlier
                  { path: ":dbIdAndSlug", element: <LegacyBrowseRedirect /> },
                  {
                    path: ":dbId/schema/:schemaName",
                    element: redirect("../databases/:dbId/schema/:schemaName"),
                  },
                ],
              },

              { path: "explore", element: <MetricsViewerPage /> },

              {
                path: "table",
                children: [
                  { path: ":slug", element: <QueryBuilder /> },
                  {
                    path: ":tableId/detail/:rowId",
                    element: <TableDetailPage />,
                  },
                ],
              },

              // INDIVIDUAL DASHBOARDS
              { path: "/auto/dashboard/*", element: <AutomaticDashboardApp /> },

              // REFERENCE
              {
                path: "/reference",
                children: [
                  { index: true, element: redirect("/reference/databases") },
                  { path: "segments", element: <SegmentListContainer /> },
                  {
                    path: "segments/:segmentId",
                    element: <SegmentDetailContainer />,
                  },
                  {
                    path: "segments/:segmentId/fields",
                    element: <SegmentFieldListContainer />,
                  },
                  {
                    path: "segments/:segmentId/fields/:fieldId",
                    element: <SegmentFieldDetailContainer />,
                  },
                  {
                    path: "segments/:segmentId/questions",
                    element: <SegmentQuestionsContainer />,
                  },
                  {
                    path: "segments/:segmentId/revisions",
                    element: <SegmentRevisionsContainer />,
                  },
                  { path: "databases", element: <DatabaseListContainer /> },
                  {
                    path: "databases/:databaseId",
                    element: <DatabaseDetailContainer />,
                  },
                  {
                    path: "databases/:databaseId/tables",
                    element: <TableListContainer />,
                  },
                  {
                    path: "databases/:databaseId/tables/:tableId",
                    element: <TableDetailContainer />,
                  },
                  {
                    path: "databases/:databaseId/tables/:tableId/fields",
                    element: <FieldListContainer />,
                  },
                  {
                    path: "databases/:databaseId/tables/:tableId/fields/:fieldId",
                    element: <FieldDetailContainer />,
                  },
                  {
                    path: "databases/:databaseId/tables/:tableId/questions",
                    element: <TableQuestionsContainer />,
                  },
                  { path: "glossary", element: <GlossaryContainer /> },
                ],
              },

              // ACCOUNT
              ...toRouteObjects(getAccountRoutes(store, IsAuthenticated)),

              // ADMIN
              ...toRouteObjects(
                getAdminRoutes(store, CanAccessSettings, IsAdmin),
              ),

              // DATA STUDIO
              ...toRouteObjects(getDataStudioRoutes(IsAdmin)),

              // MONITOR
              ...toRouteObjects(getMonitorRoutes()),
            ],
          },
        ],
      },

      // DEPRECATED
      // NOTE: these custom routes are needed because a redirect doesn't preserve the hash
      { path: "/q", element: <QuestionHashRedirect /> },
      { path: "/card/:slug", element: <QuestionHashRedirect /> },
      {
        path: "/dash/:dashboardId",
        element: redirect("/dashboard/:dashboardId"),
      },
      {
        path: "/collections/permissions",
        element: redirect("/admin/permissions/collections"),
      },

      // Transforms moved from /admin to /data-studio
      {
        path: "/admin/transforms",
        element: redirect("/data-studio/transforms"),
      },
      {
        path: "/admin/transforms/*",
        element: redirect("/data-studio/transforms/*"),
      },

      // Dependency diagnostics moved from /data-studio to /monitor
      ...toRouteObjects(getMonitorRedirects()),

      // MISC
      { path: "/unsubscribe", element: <UnsubscribePage /> },
      { path: "/unauthorized", element: <Unauthorized /> },
      { path: "/*", element: <NotFoundFallbackPage /> },
    ],
  },
];
