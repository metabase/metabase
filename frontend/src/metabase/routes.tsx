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
import { ArchiveCollectionModal } from "metabase/collections/components/ArchiveCollectionModal";
import { MoveCollectionModal } from "metabase/collections/components/MoveCollectionModal";
import { Unauthorized } from "metabase/common/components/ErrorPages";
import {
  lazyModalRoute,
  modalRoute,
} from "metabase/common/components/ModalRoute";
import { MoveQuestionsIntoDashboardsModal } from "metabase/common/components/MoveQuestionsIntoDashboardsModal";
import { NotFoundFallbackPage } from "metabase/common/components/NotFoundFallbackPage";
import { UnsubscribePage } from "metabase/common/components/Unsubscribe";
import { getDataStudioRoutes } from "metabase/data-studio/routes";
import { getEmbeddingHubRoutes } from "metabase/embedding-hub/routes";
import { getRoutes as getExplorationsRoutes } from "metabase/explorations/routes";
import { getMetabotRoutes } from "metabase/metabot/routes";
import { getMetricRoutes } from "metabase/metrics/routes";
import NewModelOptions from "metabase/models/containers/NewModelOptions";
import { getRoutes as getModelRoutes } from "metabase/models/routes";
import { getMonitorRedirects, getMonitorRoutes } from "metabase/monitor/routes";
import {
  PLUGIN_COLLECTIONS,
  PLUGIN_DATA_APPS,
  PLUGIN_TABLE_EDITING,
  PLUGIN_TENANTS,
} from "metabase/plugins";
import {
  QuestionHashRedirect,
  loadMetabotQueryBuilder,
  loadQueryBuilder,
} from "metabase/query_builder";
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
import { RedirectIfSetup } from "metabase/setup/components/RedirectIfSetup";
import { getCollectionTimelineRoutes } from "metabase/timelines/collections/routes";

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
  loadQueryBuilder().then(({ QueryBuilder }) => ({ Component: QueryBuilder }));

const metabotQueryBuilder = () =>
  loadMetabotQueryBuilder().then(({ MetabotQueryBuilder }) => ({
    Component: MetabotQueryBuilder,
  }));

/**
 * Documents, in their own chunk. It carries the rich text editing stack, which
 * nothing outside the document page needs on first paint.
 */
/**
 * The dashboard, in its own chunk. Its three modal children defer separately, so
 * opening one does not depend on the page chunk having arrived.
 */
const dashboardApp = () =>
  import(
    /* webpackChunkName: "dashboard" */ "metabase/dashboard/containers/DashboardApp/DashboardApp"
  ).then(({ DashboardApp }) => ({ Component: DashboardApp }));

const automaticDashboardApp = () =>
  import(
    /* webpackChunkName: "automatic-dashboard" */ "metabase/dashboard/containers/AutomaticDashboardApp"
  ).then(({ AutomaticDashboardApp }) => ({ Component: AutomaticDashboardApp }));

const metricsViewerPage = () =>
  import(
    /* webpackChunkName: "metrics-viewer" */ "metabase/metrics-viewer"
  ).then(({ MetricsViewerPage }) => ({
    Component: MetricsViewerPage,
  }));

const tableDetailPage = () =>
  import(
    /* webpackChunkName: "table-detail" */ "metabase/detail-view/pages/TableDetailPage"
  ).then(({ TableDetailPage }) => ({ Component: TableDetailPage }));

const documentPage = () =>
  import(/* webpackChunkName: "documents" */ "metabase/documents/routes").then(
    ({ DocumentPageOuter }) => ({
      Component: DocumentPageOuter,
    }),
  );

const setupPage = () =>
  import(
    /* webpackChunkName: "setup" */ "metabase/setup/components/Setup"
  ).then(({ Setup }) => ({ Component: Setup }));

/**
 * The home page, in its own chunk. The route also covers the redirect to a
 * configured landing page, so an instance that sets one fetches this chunk once
 * before it leaves "/".
 */
const landingPage = () =>
  import(
    /* webpackChunkName: "home" */ "metabase/home/components/LandingPageRedirect"
  ).then(({ LandingPageRedirect }) => ({ Component: LandingPageRedirect }));

const onboardingPage = () =>
  import(
    /* webpackChunkName: "onboarding" */ "metabase/home/components/Onboarding"
  ).then(({ Onboarding }) => ({ Component: Onboarding }));

const searchApp = () =>
  import(
    /* webpackChunkName: "search" */ "metabase/search/containers/SearchApp"
  ).then(({ SearchApp }) => ({ Component: SearchApp }));

const collectionLanding = () =>
  import(
    /* webpackChunkName: "collection" */ "metabase/collections/components/CollectionLanding"
  ).then((module) => ({ Component: module.default }));

const trashCollectionLanding = () =>
  import(
    /* webpackChunkName: "trash-collection" */ "metabase/collections/components/TrashCollectionLanding"
  ).then(({ TrashCollectionLanding }) => ({
    Component: TrashCollectionLanding,
  }));

const userCollectionList = () =>
  import(
    /* webpackChunkName: "user-collection-list" */ "metabase/common/components/UserCollectionList"
  ).then(({ UserCollectionList }) => ({ Component: UserCollectionList }));

/**
 * The browse pages share one chunk: they are one module apiece behind a single
 * barrel, and a visitor to one of them commonly walks into the next.
 */
const browsePage =
  (
    name:
      | "BrowseMetrics"
      | "BrowseModels"
      | "BrowseDatabases"
      | "BrowseSchemas"
      | "BrowseTables"
      | "TablePermalinkRedirect",
  ) =>
  () =>
    import(/* webpackChunkName: "browse" */ "metabase/browse").then(
      (module) => ({ Component: module[name] }),
    );

const commentsSidesheet = () =>
  import(
    /* webpackChunkName: "comments-sidesheet" */ "metabase/documents/components/CommentsSidesheet"
  ).then(({ CommentsSidesheet }) => CommentsSidesheet);

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
registerPagePrefetch("/dashboard/", dashboardApp);
registerPagePrefetch("/auto/dashboard/", automaticDashboardApp);
registerPagePrefetch("/explore", metricsViewerPage);
// The login page asks for this one by hand, so a user who signs in has the home
// page in hand by the time they land on it. Exact, because every path starts
// with "/".
registerPagePrefetch("/", landingPage, { exact: true });
registerPagePrefetch("/collection/", collectionLanding);
registerPagePrefetch("/trash", trashCollectionLanding);
registerPagePrefetch("/browse", browsePage("BrowseModels"));

export const getRoutes = (store: AppStore): RouteObject[] => [
  {
    element: <App />,
    children: [
      // SETUP
      {
        element: <RedirectIfSetup />,
        children: [{ path: "/setup", lazy: setupPage }],
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
              { path: "/", lazy: landingPage },

              {
                path: "getting-started",
                element: <CanAccessOnboarding />,
                children: [{ index: true, lazy: onboardingPage }],
              },

              { path: "search", lazy: searchApp },
              // Send historical /archive route to trash - can remove in v52
              { path: "archive", element: redirect("../trash") },
              { path: "trash", lazy: trashCollectionLanding },

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
                children: [{ index: true, lazy: userCollectionList }],
              },

              {
                path: "collection/tenant-specific",
                lazy: PLUGIN_TENANTS.canAccessTenantSpecificRoute,
                children: [
                  { index: true, lazy: PLUGIN_TENANTS.tenantCollectionList },
                ],
              },

              {
                path: "collection/tenant-users",
                element: <IsAdmin />,
                children: [
                  { index: true, lazy: PLUGIN_TENANTS.tenantUsersList },
                  {
                    path: ":tenantId",
                    lazy: PLUGIN_TENANTS.tenantUsersPersonalCollectionList,
                  },
                ],
              },

              {
                path: "collection/:slug",
                lazy: collectionLanding,
                children: [
                  ...toRouteObjects(
                    <>
                      {modalRoute("move", MoveCollectionModal, {
                        noWrap: true,
                      })}
                      {modalRoute("archive", ArchiveCollectionModal, {
                        noWrap: true,
                      })}
                      {modalRoute("permissions", CollectionPermissionsModal)}
                      {modalRoute(
                        "move-questions-dashboard",
                        MoveQuestionsIntoDashboardsModal,
                      )}
                      {PLUGIN_COLLECTIONS.cleanUpRoute}
                    </>,
                  ),
                  ...getCollectionTimelineRoutes(),
                ],
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
                lazy: dashboardApp,
                children: [
                  lazyModalRoute(
                    "move",
                    () =>
                      import(
                        /* webpackChunkName: "dashboard-move-modal" */ "metabase/dashboard/components/DashboardMoveModal"
                      ).then(
                        ({ DashboardMoveModalConnected }) =>
                          DashboardMoveModalConnected,
                      ),
                    { noWrap: true },
                  ),
                  lazyModalRoute(
                    "copy",
                    () =>
                      import(
                        /* webpackChunkName: "dashboard-copy-modal" */ "metabase/dashboard/components/DashboardCopyModal"
                      ).then(
                        ({ DashboardCopyModalConnected }) =>
                          DashboardCopyModalConnected,
                      ),
                    { noWrap: true },
                  ),
                  lazyModalRoute(
                    "archive",
                    () =>
                      import(
                        /* webpackChunkName: "dashboard-archive-modal" */ "metabase/dashboard/containers/ArchiveDashboardModal"
                      ).then(
                        ({ ArchiveDashboardModalConnected }) =>
                          ArchiveDashboardModalConnected,
                      ),
                    { noWrap: true },
                  ),
                ],
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
                  { path: "metrics", lazy: browsePage("BrowseMetrics") },
                  { path: "models", lazy: browsePage("BrowseModels") },
                  { path: "databases", lazy: browsePage("BrowseDatabases") },
                  {
                    path: "databases/:slug",
                    lazy: browsePage("BrowseSchemas"),
                  },
                  {
                    path: "databases/:dbId/schema/:schemaName",
                    lazy: browsePage("BrowseTables"),
                  },
                  {
                    path: "databases/:dbName/schema/:schemaName/table/:tableName",
                    lazy: browsePage("TablePermalinkRedirect"),
                  },
                  {
                    path: "databases/:dbName/table/:tableName",
                    lazy: browsePage("TablePermalinkRedirect"),
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

              { path: "explore", lazy: metricsViewerPage },

              {
                path: "table",
                children: [
                  { path: ":slug", lazy: queryBuilder },
                  { path: ":tableId/detail/:rowId", lazy: tableDetailPage },
                ],
              },

              // INDIVIDUAL DASHBOARDS
              { path: "/auto/dashboard/*", lazy: automaticDashboardApp },

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

              // EMBEDDING HUB
              ...toRouteObjects(getEmbeddingHubRoutes()),
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
