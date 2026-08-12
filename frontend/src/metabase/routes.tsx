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
import {
  lazyModalRoute,
  modalRoute,
} from "metabase/common/components/ModalRoute";
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
import { getRoutes as getExplorationsRoutes } from "metabase/explorations/routes";
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
import { QuestionHashRedirect } from "metabase/query_builder/components/QuestionHashRedirect";
import type { State } from "metabase/redux/store";
import { getReferenceRoutes } from "metabase/reference/routes";
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
  registerPagePrefetch,
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

/**
 * The query builder, in its own chunk. Every route that renders it names the
 * same `import()`, so they share one chunk that is fetched the first time one of
 * them is visited.
 *
 * A `lazy` route makes that first navigation asynchronous: the router resolves
 * the module before it commits the location. It resolves the route in place, so
 * every later navigation to the query builder is synchronous again.
 */
const queryBuilder = () =>
  import("metabase/query_builder/containers/QueryBuilder").then(
    ({ QueryBuilder }) => ({ Component: QueryBuilder }),
  );

const metabotQueryBuilder = () =>
  import("metabase/query_builder/components/MetabotQueryBuilder").then(
    ({ MetabotQueryBuilder }) => ({ Component: MetabotQueryBuilder }),
  );

/**
 * Documents, in their own chunk. It carries the rich text editing stack, which
 * nothing outside the document page needs on first paint.
 */
const documentPage = () =>
  import("metabase/documents/routes").then(({ DocumentPageOuter }) => ({
    Component: DocumentPageOuter,
  }));

const commentsSidesheet = () =>
  import("metabase/documents/components/CommentsSidesheet").then(
    ({ CommentsSidesheet }) => CommentsSidesheet,
  );

/**
 * Hovering a link into one of these chunks starts the fetch, so it is usually in
 * hand by the time the click lands. The router still awaits `lazy` and still
 * commits the location a tick late, so this removes the round trip rather than
 * the asynchrony. See `lazy-route.unit.spec.tsx`.
 *
 * The paths are prefixes, so `/table/` also covers the table detail page, which
 * is not the query builder. The chunk is fetched once either way, and someone
 * looking at a table row is a fair bet to open a question next.
 */
registerPagePrefetch("/question", queryBuilder);
registerPagePrefetch("/model", queryBuilder);
registerPagePrefetch("/table/", queryBuilder);
registerPagePrefetch("/question/ask", metabotQueryBuilder);
registerPagePrefetch("/document/", documentPage);
// The sidesheet is a chunk of its own, and its route carries the document id
// before the segment that names it, so a prefix cannot single it out. Registered
// against the document prefix instead: 15 kb fetched alongside a page of 337 kb,
// in exchange for the sidesheet already being there when it is opened.
registerPagePrefetch("/document/", commentsSidesheet);

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
                lazy: documentPage,
                children: [
                  lazyModalRoute("comments/:childTargetId", commentsSidesheet, {
                    noWrap: true,
                  }),
                ],
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
                  { index: true, lazy: queryBuilder },
                  { path: "notebook", lazy: queryBuilder },
                  { path: "ask", lazy: metabotQueryBuilder },
                  ...toRouteObjects(getExplorationsRoutes()),
                  { path: ":slug", lazy: queryBuilder },
                  { path: ":slug/notebook", lazy: queryBuilder },
                  { path: ":slug/metabot", lazy: queryBuilder },
                  { path: ":slug/:objectId", lazy: queryBuilder },
                ],
              },

              // MODELS
              ...toRouteObjects(getModelRoutes()),

              {
                path: "/model",
                children: [
                  { index: true, lazy: queryBuilder },
                  { path: "new", element: <NewModelOptions /> },
                  { path: ":slug", lazy: queryBuilder },
                  { path: ":slug/notebook", lazy: queryBuilder },
                  { path: ":slug/query", lazy: queryBuilder },
                  { path: ":slug/columns", lazy: queryBuilder },
                  { path: ":slug/metadata", lazy: queryBuilder },
                  { path: ":slug/metabot", lazy: queryBuilder },
                  { path: ":slug/:objectId", lazy: queryBuilder },
                  { path: "query", lazy: queryBuilder },
                  { path: "metabot", lazy: queryBuilder },
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
                  { path: ":slug", lazy: queryBuilder },
                  {
                    path: ":tableId/detail/:rowId",
                    element: <TableDetailPage />,
                  },
                ],
              },

              // INDIVIDUAL DASHBOARDS
              { path: "/auto/dashboard/*", element: <AutomaticDashboardApp /> },

              // REFERENCE
              ...getReferenceRoutes(),

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
