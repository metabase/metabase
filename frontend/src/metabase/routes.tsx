import type { Store, ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";

import App from "metabase/AppComponent";
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
import { Route, redirect, withRouteProps } from "metabase/router";
import {
  CanAccessDataModel,
  CanAccessDataStudio,
  CanAccessOnboarding,
  CanAccessSettings,
  IsAdmin,
  IsAuthenticated,
  IsNotAuthenticated,
} from "metabase/router/guards";
import { SearchApp } from "metabase/search/containers/SearchApp";
import { RedirectIfSetup } from "metabase/setup/components/RedirectIfSetup";
import { Setup } from "metabase/setup/components/Setup";
import getCollectionTimelineRoutes from "metabase/timelines/collections/routes";

import { LoadCurrentUser } from "./LoadCurrentUser";
import { createEntityIdRedirect } from "./routes-stable-id-aware";

type AppStore = Store<State> & {
  dispatch: ThunkDispatch<State, void, UnknownAction>;
};

// Legacy containers that still read v3 router props (`params`/`location`/
// `route`/`router`/`routes`), fed from the router context so they run as
// `element` routes. Removed with the shim.
const RoutedApp = withRouteProps(App);
const RoutedLogin = withRouteProps(Login);
const RoutedResetPassword = withRouteProps(ResetPassword);
const RoutedSearchApp = withRouteProps(SearchApp);
const RoutedCollectionLanding = withRouteProps(CollectionLanding);
const RoutedQueryBuilder = withRouteProps(QueryBuilder);
const RoutedMetabotQueryBuilder = withRouteProps(MetabotQueryBuilder);
const RoutedNewModelOptions = withRouteProps(NewModelOptions);
const RoutedBrowseSchemas = withRouteProps(BrowseSchemas);
const RoutedBrowseTables = withRouteProps(BrowseTables);
const RoutedTablePermalinkRedirect = withRouteProps(TablePermalinkRedirect);
const RoutedMetricsViewerPage = withRouteProps(MetricsViewerPage);
const RoutedTableDetailPage = withRouteProps(TableDetailPage);
const RoutedUnsubscribePage = withRouteProps(UnsubscribePage);

export const getRoutes = (store: AppStore) => {
  return (
    <Route element={<RoutedApp />}>
      {/* SETUP */}
      <Route element={<RedirectIfSetup />}>
        <Route
          path="/setup"
          element={<Setup />}
          props={{ disableCommandPalette: true }}
        />
      </Route>

      {/* For compatibility: use the standard setup for embedding */}
      <Route path="/setup/embedding" element={redirect("/setup")} />

      {/* APP */}
      <Route element={<LoadCurrentUser />}>
        {/* AUTH */}
        <Route path="/auth">
          <Route index element={redirect("/auth/login")} />
          <Route element={<IsNotAuthenticated />}>
            <Route path="login" element={<RoutedLogin />} />
            <Route path="login/:provider" element={<RoutedLogin />} />
          </Route>
          <Route path="logout" element={<Logout />} />
          <Route path="forgot_password" element={<ForgotPassword />} />
          <Route
            path="reset_password/:token"
            element={<RoutedResetPassword />}
          />
          {/* FE routes can sometimes be prioritized over BE
              reloading will correctly pick the SSO flow back up from the BE  */}
          <Route path="sso" element={<SsoReload />} />
          <Route path="sso/:provider" element={<SsoReload />} />
        </Route>

        {/* MAIN */}
        <Route element={<IsAuthenticated />}>
          {getMetabotRoutes()}

          {PLUGIN_DATA_APPS.isEnabled && PLUGIN_DATA_APPS.getRoutes()}

          {/* The global all hands routes, things in here are for all the folks */}
          <Route path="/" element={<LandingPageRedirect />} />

          <Route path="getting-started" element={<CanAccessOnboarding />}>
            <Route index element={<Onboarding />} />
          </Route>

          <Route path="search" element={<RoutedSearchApp />} />
          {/* Send historical /archive route to trash - can remove in v52 */}
          <Route path="archive" element={redirect("trash")} />
          <Route path="trash" element={<TrashCollectionLanding />} />

          <Route path="document/:entityId" element={<DocumentPageOuter />}>
            {modalRoute("comments/:childTargetId", CommentsSidesheet, {
              noWrap: true,
            })}
          </Route>

          <Route
            path="collection/entity/:entity_id/*"
            element={createEntityIdRedirect({
              parametersToTranslate: [
                {
                  name: "entity_id",
                  resourceType: "collection",
                  type: "param",
                },
              ],
            })}
          />

          <Route path="collection/users" element={<IsAdmin />}>
            <Route index element={<UserCollectionList />} />
          </Route>

          <Route
            path="collection/tenant-specific"
            element={<PLUGIN_TENANTS.CanAccessTenantSpecificRoute />}
          >
            <Route index element={<PLUGIN_TENANTS.TenantCollectionList />} />
          </Route>

          <Route path="collection/tenant-users" element={<IsAdmin />}>
            <Route index element={<PLUGIN_TENANTS.TenantUsersList />} />
            <Route
              path=":tenantId"
              element={<PLUGIN_TENANTS.TenantUsersPersonalCollectionList />}
            />
          </Route>

          <Route path="collection/:slug" element={<RoutedCollectionLanding />}>
            {modalRoute("move", MoveCollectionModal, { noWrap: true })}
            {modalRoute("archive", ArchiveCollectionModal, { noWrap: true })}
            {modalRoute("permissions", CollectionPermissionsModal)}
            {modalRoute(
              "move-questions-dashboard",
              MoveQuestionsIntoDashboardsModal,
            )}
            {PLUGIN_COLLECTIONS.cleanUpRoute}
            {getCollectionTimelineRoutes()}
          </Route>

          <Route
            path="dashboard/entity/:entity_id/*"
            element={createEntityIdRedirect({
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
            })}
          />

          <Route path="dashboard/:slug" element={<DashboardApp />}>
            {modalRoute("move", DashboardMoveModalConnected, { noWrap: true })}
            {modalRoute("copy", DashboardCopyModalConnected, { noWrap: true })}
            {modalRoute("archive", ArchiveDashboardModalConnected, {
              noWrap: true,
            })}
          </Route>

          <Route path="/question">
            <Route
              path="/question/entity/:entity_id/*"
              element={createEntityIdRedirect({
                parametersToTranslate: [
                  {
                    name: "entity_id",
                    resourceType: "card",
                    type: "param",
                  },
                ],
              })}
            />
            <Route index element={<RoutedQueryBuilder />} />
            <Route path="notebook" element={<RoutedQueryBuilder />} />
            <Route path="ask" element={<RoutedMetabotQueryBuilder />} />
            <Route path=":slug" element={<RoutedQueryBuilder />} />
            <Route path=":slug/notebook" element={<RoutedQueryBuilder />} />
            <Route path=":slug/metabot" element={<RoutedQueryBuilder />} />
            <Route path=":slug/:objectId" element={<RoutedQueryBuilder />} />
          </Route>

          {/* MODELS */}
          {getModelRoutes()}

          <Route path="/model">
            <Route index element={<RoutedQueryBuilder />} />
            <Route path="new" element={<RoutedNewModelOptions />} />
            <Route path=":slug" element={<RoutedQueryBuilder />} />
            <Route path=":slug/notebook" element={<RoutedQueryBuilder />} />
            <Route path=":slug/query" element={<RoutedQueryBuilder />} />
            <Route path=":slug/columns" element={<RoutedQueryBuilder />} />
            <Route path=":slug/metadata" element={<RoutedQueryBuilder />} />
            <Route path=":slug/metabot" element={<RoutedQueryBuilder />} />
            <Route path=":slug/:objectId" element={<RoutedQueryBuilder />} />
            <Route path="query" element={<RoutedQueryBuilder />} />
            <Route path="metabot" element={<RoutedQueryBuilder />} />
          </Route>

          {getMetricRoutes()}

          <Route path="browse">
            <Route index element={redirect("/browse/models")} />
            <Route path="metrics" element={<BrowseMetrics />} />
            <Route path="models" element={<BrowseModels />} />
            <Route path="databases" element={<BrowseDatabases />} />
            <Route path="databases/:slug" element={<RoutedBrowseSchemas />} />
            <Route
              path="databases/:dbId/schema/:schemaName"
              element={<RoutedBrowseTables />}
            />
            <Route
              path="databases/:dbName/schema/:schemaName/table/:tableName"
              element={<RoutedTablePermalinkRedirect />}
            />
            <Route
              path="databases/:dbName/table/:tableName"
              element={<RoutedTablePermalinkRedirect />}
            />

            {PLUGIN_TABLE_EDITING.getRoutes()}

            {/* These two Redirects support legacy paths in v48 and earlier */}
            <Route
              path=":dbId-:slug"
              element={redirect("databases/:dbId-:slug")}
            />
            <Route
              path=":dbId/schema/:schemaName"
              element={redirect("databases/:dbId/schema/:schemaName")}
            />
          </Route>

          <Route path="explore" element={<RoutedMetricsViewerPage />} />

          <Route path="table">
            <Route path=":slug" element={<RoutedQueryBuilder />} />
            <Route
              path=":tableId/detail/:rowId"
              element={<RoutedTableDetailPage />}
            />
          </Route>

          {/* INDIVIDUAL DASHBOARDS */}

          <Route path="/auto/dashboard/*" element={<AutomaticDashboardApp />} />

          {/* REFERENCE */}
          <Route path="/reference">
            <Route index element={redirect("/reference/databases")} />
            <Route path="segments" element={<SegmentListContainer />} />
            <Route
              path="segments/:segmentId"
              element={<SegmentDetailContainer />}
            />
            <Route
              path="segments/:segmentId/fields"
              element={<SegmentFieldListContainer />}
            />
            <Route
              path="segments/:segmentId/fields/:fieldId"
              element={<SegmentFieldDetailContainer />}
            />
            <Route
              path="segments/:segmentId/questions"
              element={<SegmentQuestionsContainer />}
            />
            <Route
              path="segments/:segmentId/revisions"
              element={<SegmentRevisionsContainer />}
            />
            <Route path="databases" element={<DatabaseListContainer />} />
            <Route
              path="databases/:databaseId"
              element={<DatabaseDetailContainer />}
            />
            <Route
              path="databases/:databaseId/tables"
              element={<TableListContainer />}
            />
            <Route
              path="databases/:databaseId/tables/:tableId"
              element={<TableDetailContainer />}
            />
            <Route
              path="databases/:databaseId/tables/:tableId/fields"
              element={<FieldListContainer />}
            />
            <Route
              path="databases/:databaseId/tables/:tableId/fields/:fieldId"
              element={<FieldDetailContainer />}
            />
            <Route
              path="databases/:databaseId/tables/:tableId/questions"
              element={<TableQuestionsContainer />}
            />
            <Route path="glossary" element={<GlossaryContainer />} />
          </Route>

          {/* ACCOUNT */}
          {getAccountRoutes(store, IsAuthenticated)}

          {/* ADMIN */}
          {getAdminRoutes(store, CanAccessSettings, IsAdmin)}

          {/* DATA STUDIO */}
          {getDataStudioRoutes(
            CanAccessDataStudio,
            CanAccessDataModel,
            IsAdmin,
          )}
        </Route>
      </Route>

      {/* DEPRECATED */}
      {/* NOTE: these custom routes are needed because <Redirect> doesn't preserve the hash */}
      <Route path="/q" element={<QuestionHashRedirect />} />
      <Route path="/card/:slug" element={<QuestionHashRedirect />} />
      <Route
        path="/dash/:dashboardId"
        element={redirect("/dashboard/:dashboardId")}
      />
      <Route
        path="/collections/permissions"
        element={redirect("/admin/permissions/collections")}
      />

      {/* Transforms moved from /admin to /data-studio */}
      <Route
        path="/admin/transforms"
        element={redirect("/data-studio/transforms")}
      />
      <Route
        path="/admin/transforms/*"
        element={redirect("/data-studio/transforms/*")}
      />

      {/* MISC */}
      <Route path="/unsubscribe" element={<RoutedUnsubscribePage />} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="/*" element={<NotFoundFallbackPage />} />
    </Route>
  );
};
