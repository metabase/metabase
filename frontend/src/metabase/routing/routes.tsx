import type { Store } from "@reduxjs/toolkit";
import type { Location } from "history";
import type { ComponentType } from "react";
import { useEffect, useRef } from "react";
import { Navigate, Outlet, type RouteObject } from "react-router-dom";

import App from "metabase/App";
import { getAccountRouteObjects } from "metabase/account/routes";
import CollectionPermissionsModal from "metabase/admin/permissions/components/CollectionPermissionsModal/CollectionPermissionsModal";
import { getAdminRouteObjects } from "metabase/admin/routes";
import { ForgotPassword } from "metabase/auth/components/ForgotPassword";
import { Login } from "metabase/auth/components/Login";
import { Logout } from "metabase/auth/components/Logout";
import { ResetPassword } from "metabase/auth/components/ResetPassword";
import {
  BrowseDatabases,
  BrowseMetrics,
  BrowseModels,
  BrowseSchemas,
  BrowseTables,
} from "metabase/browse";
import { ArchiveCollectionModal } from "metabase/collections/components/ArchiveCollectionModal";
import CollectionLandingComponent from "metabase/collections/components/CollectionLanding";
import { MoveCollectionModal } from "metabase/collections/components/MoveCollectionModal";
import { TrashCollectionLanding } from "metabase/collections/components/TrashCollectionLanding";
import { Unauthorized } from "metabase/common/components/ErrorPages";
import { MoveQuestionsIntoDashboardsModal } from "metabase/common/components/MoveQuestionsIntoDashboardsModal";
import { NotFoundFallbackPage } from "metabase/common/components/NotFoundFallbackPage";
import { UnsubscribePage } from "metabase/common/components/Unsubscribe";
import { UserCollectionList } from "metabase/common/components/UserCollectionList";
import { DashboardCopyModalConnected } from "metabase/dashboard/components/DashboardCopyModal";
import { DashboardMoveModalConnected } from "metabase/dashboard/components/DashboardMoveModal";
import { ArchiveDashboardModalConnected } from "metabase/dashboard/containers/ArchiveDashboardModal";
import { AutomaticDashboardApp } from "metabase/dashboard/containers/AutomaticDashboardApp";
import { DashboardApp } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { getDataStudioRouteObjects } from "metabase/data-studio/routes";
import { TableDetailPage } from "metabase/detail-view/pages/TableDetailPage";
import { CommentsSidesheet } from "metabase/documents/components/CommentsSidesheet";
import { DocumentPageOuter } from "metabase/documents/routes";
import { HomePage } from "metabase/home/components/HomePage";
import { Onboarding } from "metabase/home/components/Onboarding";
import { trackPageView } from "metabase/lib/analytics";
import { useDispatch, useSelector } from "metabase/lib/redux";
import NewModelOptions from "metabase/models/containers/NewModelOptions";
import { getModelRouteObjects } from "metabase/models/routes";
import {
  PLUGIN_COLLECTIONS,
  PLUGIN_LANDING_PAGE,
  PLUGIN_METABOT,
  PLUGIN_TABLE_EDITING,
  PLUGIN_TENANTS,
} from "metabase/plugins";
import { QueryBuilder } from "metabase/query_builder/containers/QueryBuilder";
import { loadCurrentUser } from "metabase/redux/user";
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
import { createEntityIdRedirect } from "metabase/routes-stable-id-aware";
import SearchApp from "metabase/search/containers/SearchApp";
import { getSetting } from "metabase/selectors/settings";
import { Setup } from "metabase/setup/components/Setup";
import { getRouteObjects as getCollectionTimelineRouteObjects } from "metabase/timelines/collections/routes";
import type { State } from "metabase-types/store";

import {
  IsAdminGuard,
  IsAuthenticatedGuard,
  IsNotAuthenticatedGuard,
  UserCanAccessOnboardingGuard,
  createModalRoute,
  useLocationWithQuery,
  useRouteParams,
} from "./compat";

const AppWithRouteProps = () => {
  const location = useLocationWithQuery();

  return (
    <App location={location as unknown as Location} onError={() => undefined}>
      <Outlet />
    </App>
  );
};

const SetupGuard = () => {
  const hasUserSetup = useSelector((state: State) =>
    getSetting(state, "has-user-setup"),
  );

  useEffect(() => {
    trackPageView(window.location.pathname);
  }, []);

  if (hasUserSetup) {
    return <Navigate to="/" replace />;
  }

  return <Setup />;
};

const AppBootstrap = () => {
  const dispatch = useDispatch();
  const location = useLocationWithQuery();
  const previousPathRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    dispatch(loadCurrentUser());
  }, [dispatch]);

  useEffect(() => {
    if (previousPathRef.current !== location.pathname) {
      trackPageView(location.pathname);
      previousPathRef.current = location.pathname;
    }
  }, [location.pathname]);

  return <Outlet />;
};

const HomeRoute = () => {
  const page = PLUGIN_LANDING_PAGE.getLandingPage();

  if (page && page !== "/") {
    return (
      <Navigate
        to={{
          pathname: page.startsWith("/") ? page : `/${page}`,
        }}
        state={{ preserveNavbarState: true }}
        replace
      />
    );
  }

  return <HomePage />;
};

const SearchAppWithLocation = () => {
  const location = useLocationWithQuery();
  return <SearchApp location={location} />;
};

const CollectionLandingWithParams = () => {
  const params = useRouteParams<{ slug?: string }>();

  return (
    <CollectionLandingComponent params={{ slug: params.slug ?? "" }}>
      <Outlet />
    </CollectionLandingComponent>
  );
};

const QueryBuilderWithRouteProps = () => {
  const location = useLocationWithQuery();
  const params = useRouteParams<Record<string, string | undefined>>();

  return (
    <QueryBuilder location={location as unknown as Location} params={params} />
  );
};

const NewModelOptionsWithRouteProps = () => {
  const location = useLocationWithQuery();
  return <NewModelOptions location={location as unknown as Location} />;
};

const BrowseSchemasWithParams = () => {
  const params = useRouteParams<{ slug?: string }>();
  return <BrowseSchemas params={params} />;
};

const BrowseTablesWithParams = () => {
  const params = useRouteParams<{ dbId?: string; schemaName?: string }>();
  return (
    <BrowseTables params={params as { dbId: string; schemaName: string }} />
  );
};

const TableDetailPageWithParams = () => {
  const params = useRouteParams<{ tableId?: string; rowId?: string }>();
  return (
    <TableDetailPage params={params as { tableId: string; rowId: string }} />
  );
};

const DocumentPageOuterWithRouteProps = () => {
  const location = useLocationWithQuery();
  const params = useRouteParams<{ entityId?: string }>();

  return (
    <DocumentPageOuter
      location={location as unknown as Location}
      params={{ entityId: params.entityId ?? "" }}
    />
  );
};

const CommentsSidesheetWithRouteProps = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const params = useRouteParams<{ childTargetId?: string }>();

  return (
    <CommentsSidesheet
      onClose={onClose}
      params={{ childTargetId: params.childTargetId ?? "" }}
    />
  );
};

const UnsubscribePageWithLocation = () => {
  const location = useLocationWithQuery();
  return <UnsubscribePage location={location as unknown as Location} />;
};

const TenantUsersPersonalCollectionListWithParams = () => {
  const params = useRouteParams<{ tenantId?: string }>();

  return (
    <PLUGIN_TENANTS.TenantUsersPersonalCollectionList
      params={{ tenantId: params.tenantId ?? "" }}
    />
  );
};

const TenantSpecificRouteGuard = () => (
  <PLUGIN_TENANTS.CanAccessTenantSpecificRoute>
    <Outlet />
  </PLUGIN_TENANTS.CanAccessTenantSpecificRoute>
);

const LegacyQuestionRedirect = () => {
  const location = useLocationWithQuery();

  return (
    <Navigate to={{ pathname: "/question", hash: location.hash }} replace />
  );
};

const LegacyCardRedirect = () => {
  const location = useLocationWithQuery();
  const params = useRouteParams<{ slug?: string }>();

  return (
    <Navigate
      to={{
        pathname: `/question/${params.slug ?? ""}`,
        hash: location.hash,
      }}
      replace
    />
  );
};

const LegacyDashRedirect = () => {
  const params = useRouteParams<{ dashboardId?: string }>();

  return <Navigate to={`/dashboard/${params.dashboardId ?? ""}`} replace />;
};

const MoveCollectionModalWithParams = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const params = useRouteParams<{ slug?: string }>();

  return (
    <MoveCollectionModal
      onClose={onClose}
      params={{ slug: params.slug ?? "" }}
    />
  );
};

const ArchiveCollectionModalWithParams = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const params = useRouteParams<{ slug?: string }>();

  return (
    <ArchiveCollectionModal
      onClose={onClose}
      params={{ slug: params.slug ?? "" }}
    />
  );
};

const CollectionPermissionsModalWithParams = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const params = useRouteParams<{ slug?: string }>();

  return (
    <CollectionPermissionsModal
      onClose={onClose}
      params={{ slug: params.slug ?? "" }}
    />
  );
};

function withLegacyRouteProps<T extends object>(Component: ComponentType<T>) {
  return function LegacyRoutePropsWrapper() {
    const location = useLocationWithQuery();
    const params = useRouteParams<Record<string, string | undefined>>();

    return (
      <Component
        {...({
          location: location as unknown as Location,
          params,
        } as T)}
      />
    );
  };
}

const LegacyBrowseDatabaseRedirect = () => {
  const { dbId, slug } = useRouteParams<{ dbId?: string; slug?: string }>();
  return <Navigate to={`/browse/databases/${dbId}-${slug}`} replace />;
};

const LegacyBrowseSchemaRedirect = () => {
  const { dbId, schemaName } = useRouteParams<{
    dbId?: string;
    schemaName?: string;
  }>();

  return (
    <Navigate to={`/browse/databases/${dbId}/schema/${schemaName}`} replace />
  );
};

const QuestionEntityIdRedirect = createEntityIdRedirect({
  parametersToTranslate: [
    {
      name: "entity_id",
      resourceType: "card",
      type: "param",
    },
  ],
});

const CollectionEntityIdRedirect = createEntityIdRedirect({
  parametersToTranslate: [
    {
      name: "entity_id",
      resourceType: "collection",
      type: "param",
    },
  ],
});

const DashboardEntityIdRedirect = createEntityIdRedirect({
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
});

const ReferenceDatabaseList = withLegacyRouteProps(DatabaseListContainer);
const ReferenceDatabaseDetail = withLegacyRouteProps(DatabaseDetailContainer);
const ReferenceTableList = withLegacyRouteProps(TableListContainer);
const ReferenceTableDetail = withLegacyRouteProps(TableDetailContainer);
const ReferenceFieldList = withLegacyRouteProps(FieldListContainer);
const ReferenceFieldDetail = withLegacyRouteProps(FieldDetailContainer);
const ReferenceTableQuestions = withLegacyRouteProps(TableQuestionsContainer);
const ReferenceSegmentList = withLegacyRouteProps(SegmentListContainer);
const ReferenceSegmentDetail = withLegacyRouteProps(SegmentDetailContainer);
const ReferenceSegmentFieldList = withLegacyRouteProps(
  SegmentFieldListContainer,
);
const ReferenceSegmentFieldDetail = withLegacyRouteProps(
  SegmentFieldDetailContainer,
);
const ReferenceSegmentQuestions = withLegacyRouteProps(
  SegmentQuestionsContainer,
);
const ReferenceSegmentRevisions = withLegacyRouteProps(
  SegmentRevisionsContainer,
);

export function createRoutes(store: Store): RouteObject[] {
  return [
    {
      element: <AppWithRouteProps />,
      children: [
        {
          path: "/setup",
          element: <SetupGuard />,
        },
        { path: "/setup/embedding", element: <Navigate to="/setup" replace /> },

        {
          path: "/auth",
          element: <AppBootstrap />,
          children: [
            { index: true, element: <Navigate to="/auth/login" replace /> },
            {
              element: <IsNotAuthenticatedGuard />,
              children: [
                { path: "login", element: <Login /> },
                { path: "login/:provider", element: <Login /> },
              ],
            },
            { path: "logout", element: <Logout /> },
            { path: "forgot_password", element: <ForgotPassword /> },
            { path: "reset_password/:token", element: <ResetPassword /> },
          ],
        },

        {
          element: <AppBootstrap />,
          children: [
            {
              element: <IsAuthenticatedGuard />,
              children: [
                ...PLUGIN_METABOT.getMetabotRouteObjects(),
                { path: "/", element: <HomeRoute /> },
                {
                  path: "/getting-started",
                  element: <UserCanAccessOnboardingGuard />,
                  children: [{ index: true, element: <Onboarding /> }],
                },
                { path: "/search", element: <SearchAppWithLocation /> },
                { path: "/archive", element: <Navigate to="/trash" replace /> },
                { path: "/trash", element: <TrashCollectionLanding /> },
                {
                  path: "/browse",
                  children: [
                    {
                      index: true,
                      element: <Navigate to="/browse/models" replace />,
                    },
                    { path: "metrics", element: <BrowseMetrics /> },
                    { path: "models", element: <BrowseModels /> },
                    { path: "databases", element: <BrowseDatabases /> },
                    {
                      path: "databases/:slug",
                      element: <BrowseSchemasWithParams />,
                    },
                    {
                      path: "databases/:dbId/schema/:schemaName",
                      element: <BrowseTablesWithParams />,
                    },
                    {
                      path: ":dbId-:slug",
                      element: <LegacyBrowseDatabaseRedirect />,
                    },
                    {
                      path: ":dbId/schema/:schemaName",
                      element: <LegacyBrowseSchemaRedirect />,
                    },
                    ...PLUGIN_TABLE_EDITING.getRouteObjects(),
                  ],
                },
                {
                  path: "/table/:tableId/detail/:rowId",
                  element: <TableDetailPageWithParams />,
                },
                {
                  path: "/collection/entity/:entity_id",
                  element: <CollectionEntityIdRedirect />,
                },
                {
                  path: "/collection/:slug",
                  element: <CollectionLandingWithParams />,
                  children: [
                    createModalRoute("move", MoveCollectionModalWithParams, {
                      noWrap: true,
                    }),
                    createModalRoute(
                      "archive",
                      ArchiveCollectionModalWithParams,
                      {
                        noWrap: true,
                      },
                    ),
                    createModalRoute(
                      "permissions",
                      CollectionPermissionsModalWithParams,
                    ),
                    createModalRoute(
                      "move-questions-dashboard",
                      MoveQuestionsIntoDashboardsModal,
                    ),
                    ...PLUGIN_COLLECTIONS.cleanUpRouteObjects,
                    ...getCollectionTimelineRouteObjects(),
                  ],
                },
                {
                  path: "/collection/users",
                  element: <IsAdminGuard />,
                  children: [{ index: true, element: <UserCollectionList /> }],
                },
                {
                  path: "/collection/tenant-specific",
                  element: <TenantSpecificRouteGuard />,
                  children: [
                    {
                      index: true,
                      element: <PLUGIN_TENANTS.TenantCollectionList />,
                    },
                  ],
                },
                {
                  path: "/collection/tenant-users",
                  element: <IsAdminGuard />,
                  children: [
                    {
                      index: true,
                      element: <PLUGIN_TENANTS.TenantUsersList />,
                    },
                    {
                      path: ":tenantId",
                      element: <TenantUsersPersonalCollectionListWithParams />,
                    },
                  ],
                },
                {
                  path: "/document/:entityId",
                  element: <DocumentPageOuterWithRouteProps />,
                  children: [
                    createModalRoute(
                      "comments/:childTargetId",
                      CommentsSidesheetWithRouteProps,
                      {
                        noWrap: true,
                        modalProps: {
                          enableTransition: false,
                          closeOnClickOutside: false,
                        },
                      },
                    ),
                  ],
                },
                {
                  path: "/question",
                  children: [
                    {
                      path: "entity/:entity_id",
                      element: <QuestionEntityIdRedirect />,
                    },
                    { index: true, element: <QueryBuilderWithRouteProps /> },
                    ...PLUGIN_METABOT.getMetabotQueryBuilderRouteObjects(),
                    {
                      path: "notebook",
                      element: <QueryBuilderWithRouteProps />,
                    },
                    { path: ":slug", element: <QueryBuilderWithRouteProps /> },
                    {
                      path: ":slug/notebook",
                      element: <QueryBuilderWithRouteProps />,
                    },
                    {
                      path: ":slug/metabot",
                      element: <QueryBuilderWithRouteProps />,
                    },
                    {
                      path: ":slug/:objectId",
                      element: <QueryBuilderWithRouteProps />,
                    },
                  ],
                },
                {
                  path: "/model",
                  children: [
                    { index: true, element: <QueryBuilderWithRouteProps /> },
                    { path: "new", element: <NewModelOptionsWithRouteProps /> },
                    { path: "query", element: <QueryBuilderWithRouteProps /> },
                    {
                      path: "metabot",
                      element: <QueryBuilderWithRouteProps />,
                    },
                    { path: ":slug", element: <QueryBuilderWithRouteProps /> },
                    {
                      path: ":slug/notebook",
                      element: <QueryBuilderWithRouteProps />,
                    },
                    {
                      path: ":slug/query",
                      element: <QueryBuilderWithRouteProps />,
                    },
                    {
                      path: ":slug/columns",
                      element: <QueryBuilderWithRouteProps />,
                    },
                    {
                      path: ":slug/metadata",
                      element: <QueryBuilderWithRouteProps />,
                    },
                    {
                      path: ":slug/metabot",
                      element: <QueryBuilderWithRouteProps />,
                    },
                    {
                      path: ":slug/:objectId",
                      element: <QueryBuilderWithRouteProps />,
                    },
                  ],
                },
                {
                  path: "/metric",
                  children: [
                    { index: true, element: <QueryBuilderWithRouteProps /> },
                    {
                      path: "notebook",
                      element: <QueryBuilderWithRouteProps />,
                    },
                    { path: "query", element: <QueryBuilderWithRouteProps /> },
                    { path: ":slug", element: <QueryBuilderWithRouteProps /> },
                    {
                      path: ":slug/notebook",
                      element: <QueryBuilderWithRouteProps />,
                    },
                    {
                      path: ":slug/query",
                      element: <QueryBuilderWithRouteProps />,
                    },
                  ],
                },
                {
                  path: "/dashboard/entity/:entity_id",
                  element: <DashboardEntityIdRedirect />,
                },
                ...getModelRouteObjects(),
                ...getAccountRouteObjects(),
                {
                  path: "/dashboard/:slug",
                  element: <DashboardApp />,
                  children: [
                    createModalRoute("move", DashboardMoveModalConnected, {
                      noWrap: true,
                    }),
                    createModalRoute("copy", DashboardCopyModalConnected, {
                      noWrap: true,
                    }),
                    createModalRoute(
                      "archive",
                      ArchiveDashboardModalConnected,
                      {
                        noWrap: true,
                      },
                    ),
                  ],
                },
                {
                  path: "/auto/dashboard/*",
                  element: <AutomaticDashboardApp />,
                },
                {
                  path: "/reference",
                  children: [
                    {
                      index: true,
                      element: <Navigate to="/reference/databases" replace />,
                    },
                    { path: "segments", element: <ReferenceSegmentList /> },
                    {
                      path: "segments/:segmentId",
                      element: <ReferenceSegmentDetail />,
                    },
                    {
                      path: "segments/:segmentId/fields",
                      element: <ReferenceSegmentFieldList />,
                    },
                    {
                      path: "segments/:segmentId/fields/:fieldId",
                      element: <ReferenceSegmentFieldDetail />,
                    },
                    {
                      path: "segments/:segmentId/questions",
                      element: <ReferenceSegmentQuestions />,
                    },
                    {
                      path: "segments/:segmentId/revisions",
                      element: <ReferenceSegmentRevisions />,
                    },
                    { path: "databases", element: <ReferenceDatabaseList /> },
                    {
                      path: "databases/:databaseId",
                      element: <ReferenceDatabaseDetail />,
                    },
                    {
                      path: "databases/:databaseId/tables",
                      element: <ReferenceTableList />,
                    },
                    {
                      path: "databases/:databaseId/tables/:tableId",
                      element: <ReferenceTableDetail />,
                    },
                    {
                      path: "databases/:databaseId/tables/:tableId/fields",
                      element: <ReferenceFieldList />,
                    },
                    {
                      path: "databases/:databaseId/tables/:tableId/fields/:fieldId",
                      element: <ReferenceFieldDetail />,
                    },
                    {
                      path: "databases/:databaseId/tables/:tableId/questions",
                      element: <ReferenceTableQuestions />,
                    },
                    { path: "glossary", element: <GlossaryContainer /> },
                  ],
                },
                ...getAdminRouteObjects(store),
                ...getDataStudioRouteObjects(),
              ],
            },
          ],
        },

        { path: "/q", element: <LegacyQuestionRedirect /> },
        { path: "/card/:slug", element: <LegacyCardRedirect /> },
        {
          path: "/dash/:dashboardId",
          element: <LegacyDashRedirect />,
        },
        {
          path: "/collections/permissions",
          element: <Navigate to="/admin/permissions/collections" replace />,
        },
        { path: "/unsubscribe", element: <UnsubscribePageWithLocation /> },
        { path: "/unauthorized", element: <Unauthorized /> },
        { path: "*", element: <NotFoundFallbackPage /> },
      ],
    },
  ];
}

/**
 * Route paths for type-safe navigation.
 *
 * Usage:
 * ```tsx
 * const navigate = useNavigate();
 * navigate(ROUTES.dashboard("my-dashboard-123"));
 * ```
 */
export const ROUTES = {
  home: () => "/",
  login: () => "/auth/login",
  logout: () => "/auth/logout",
  setup: () => "/setup",
  search: () => "/search",
  trash: () => "/trash",
  collection: (slug: string) => `/collection/${slug}`,
  dashboard: (slug: string) => `/dashboard/${slug}`,
  question: (slug?: string) => (slug ? `/question/${slug}` : "/question"),
  model: (slug?: string) => (slug ? `/model/${slug}` : "/model"),
  metric: (slug?: string) => (slug ? `/metric/${slug}` : "/metric"),
  browseModels: () => "/browse/models",
  browseMetrics: () => "/browse/metrics",
  browseDatabases: () => "/browse/databases",
  admin: {
    root: () => "/admin",
    databases: () => "/admin/databases",
    people: () => "/admin/people",
    permissions: () => "/admin/permissions",
    settings: () => "/admin/settings",
  },
} as const;
