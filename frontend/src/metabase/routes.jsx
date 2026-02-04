import { IndexRedirect, IndexRoute, Redirect, Route } from "react-router";

import App from "metabase/App.tsx";
import getAccountRoutes from "metabase/account/routes";
import CollectionPermissionsModal from "metabase/admin/permissions/components/CollectionPermissionsModal/CollectionPermissionsModal";
import { getRoutes as getAdminRoutes } from "metabase/admin/routes";
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
import CollectionLanding from "metabase/collections/components/CollectionLanding";
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
import { TableDetailPage } from "metabase/detail-view/pages/TableDetailPage";
import { CommentsSidesheet } from "metabase/documents/components/CommentsSidesheet";
import { DocumentPageOuter } from "metabase/documents/routes";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import { HomePage } from "metabase/home/components/HomePage";
import { Onboarding } from "metabase/home/components/Onboarding";
import { trackPageView } from "metabase/lib/analytics";
import { MetricsExplorerPage } from "metabase/metrics-explorer";
import NewModelOptions from "metabase/models/containers/NewModelOptions";
import { getRoutes as getModelRoutes } from "metabase/models/routes";
import {
  PLUGIN_COLLECTIONS,
  PLUGIN_DATA_STUDIO,
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
import SearchApp from "metabase/search/containers/SearchApp";
import { Setup } from "metabase/setup/components/Setup";
import getCollectionTimelineRoutes from "metabase/timelines/collections/routes";

import {
  CanAccessDataModel,
  CanAccessDataStudio,
  CanAccessOnboarding,
  CanAccessSettings,
  CanAccessTransforms,
  IsAdmin,
  IsAuthenticated,
  IsNotAuthenticated,
} from "./route-guards";
import { createEntityIdRedirect } from "./routes-stable-id-aware";
import { getSetting } from "./selectors/settings";

export const getRoutes = (store) => {
  const hasUserSetup = getSetting(store.getState(), "has-user-setup");

  return (
    <Route component={App}>
      {/* SETUP */}
      <Route
        path="/setup"
        component={Setup}
        onEnter={(nextState, replace) => {
          if (hasUserSetup) {
            replace("/");
          }
          trackPageView(location.pathname);
        }}
        onChange={(prevState, nextState) => {
          trackPageView(nextState.location.pathname);
        }}
        disableCommandPalette
      />

      {/* For compatibility: use the standard setup for embedding */}
      <Redirect from="/setup/embedding" to="/setup" />

      {/* APP */}
      <Route
        onEnter={async (nextState, replace, done) => {
          await store.dispatch(loadCurrentUser());
          trackPageView(nextState.location.pathname);
          done();
        }}
        onChange={(prevState, nextState) => {
          if (nextState.location.pathname !== prevState.location.pathname) {
            trackPageView(nextState.location.pathname);
          }
        }}
      >
        {/* AUTH */}
        <Route path="/auth">
          <IndexRedirect to="/auth/login" />
          <Route component={IsNotAuthenticated}>
            <Route path="login" component={Login} />
            <Route path="login/:provider" component={Login} />
          </Route>
          <Route path="logout" component={Logout} />
          <Route path="forgot_password" component={ForgotPassword} />
          <Route path="reset_password/:token" component={ResetPassword} />
        </Route>

        {/* MAIN */}
        <Route component={IsAuthenticated}>
          {PLUGIN_METABOT.getMetabotRoutes()}

          {/* The global all hands routes, things in here are for all the folks */}
          <Route
            path="/"
            component={HomePage}
            onEnter={(nextState, replace) => {
              const page = PLUGIN_LANDING_PAGE.getLandingPage();
              if (page && page !== "/") {
                replace({
                  pathname: page.startsWith("/") ? page : `/${page}`,
                  state: { preserveNavbarState: true },
                });
              }
            }}
          />

          <Route path="getting-started" component={CanAccessOnboarding}>
            <IndexRoute component={Onboarding} />
          </Route>

          <Route path="search" component={SearchApp} />
          {/* Send historical /archive route to trash - can remove in v52 */}
          <Redirect from="archive" to="trash" replace />
          <Route path="trash" component={TrashCollectionLanding} />

          <Route path="document/:entityId" component={DocumentPageOuter}>
            <ModalRoute
              path="comments/:childTargetId"
              modal={CommentsSidesheet}
              noWrap
              modalProps={{
                enableTransition: false,
                closeOnClickOutside: false,
              }}
            />
          </Route>

          <Route
            path="collection/entity/:entity_id(**)"
            component={createEntityIdRedirect({
              parametersToTranslate: [
                {
                  name: "entity_id",
                  resourceType: "collection",
                  type: "param",
                },
              ],
            })}
          />

          <Route path="collection/users" component={IsAdmin}>
            <IndexRoute component={UserCollectionList} />
          </Route>

          <Route path="collection/tenant-specific" component={IsAdmin}>
            <IndexRoute component={PLUGIN_TENANTS.TenantCollectionList} />
          </Route>

          <Route path="collection/tenant-users" component={IsAdmin}>
            <IndexRoute component={PLUGIN_TENANTS.TenantUsersList} />
            <Route
              path=":tenantId"
              component={PLUGIN_TENANTS.TenantUsersPersonalCollectionList}
            />
          </Route>

          <Route path="collection/:slug" component={CollectionLanding}>
            <ModalRoute path="move" modal={MoveCollectionModal} noWrap />
            <ModalRoute path="archive" modal={ArchiveCollectionModal} noWrap />
            <ModalRoute path="permissions" modal={CollectionPermissionsModal} />
            <ModalRoute
              path="move-questions-dashboard"
              modal={MoveQuestionsIntoDashboardsModal}
            />
            {PLUGIN_COLLECTIONS.cleanUpRoute}
            {getCollectionTimelineRoutes()}
          </Route>

          <Route
            path="dashboard/entity/:entity_id(**)"
            component={createEntityIdRedirect({
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

          <Route path="dashboard/:slug" component={DashboardApp}>
            <ModalRoute
              path="move"
              modal={DashboardMoveModalConnected}
              noWrap
            />
            <ModalRoute
              path="copy"
              modal={DashboardCopyModalConnected}
              noWrap
            />
            <ModalRoute
              path="archive"
              modal={ArchiveDashboardModalConnected}
              noWrap
            />
          </Route>

          <Route path="/question">
            <Route
              path="/question/entity/:entity_id(**)"
              component={createEntityIdRedirect({
                parametersToTranslate: [
                  {
                    name: "entity_id",
                    resourceType: "card",
                    type: "param",
                  },
                ],
              })}
            />
            <IndexRoute component={QueryBuilder} />
            {PLUGIN_METABOT.getMetabotQueryBuilderRoute()}
            <Route path="notebook" component={QueryBuilder} />
            <Route path=":slug" component={QueryBuilder} />
            <Route path=":slug/notebook" component={QueryBuilder} />
            <Route path=":slug/metabot" component={QueryBuilder} />
            <Route path=":slug/:objectId" component={QueryBuilder} />
          </Route>

          {/* MODELS */}
          {getModelRoutes()}

          <Route path="/model">
            <IndexRoute component={QueryBuilder} />
            <Route path="new" component={NewModelOptions} />
            <Route path=":slug" component={QueryBuilder} />
            <Route path=":slug/notebook" component={QueryBuilder} />
            <Route path=":slug/query" component={QueryBuilder} />
            <Route path=":slug/columns" component={QueryBuilder} />
            <Route path=":slug/metadata" component={QueryBuilder} />
            <Route path=":slug/metabot" component={QueryBuilder} />
            <Route path=":slug/:objectId" component={QueryBuilder} />
            <Route path="query" component={QueryBuilder} />
            <Route path="metabot" component={QueryBuilder} />
          </Route>

          {/* METRICS V2 */}
          <Route path="/metric">
            <IndexRoute component={QueryBuilder} />
            <Route path="notebook" component={QueryBuilder} />
            <Route path="query" component={QueryBuilder} />
            <Route path=":slug" component={QueryBuilder} />
            <Route path=":slug/notebook" component={QueryBuilder} />
            <Route path=":slug/query" component={QueryBuilder} />
          </Route>

          <Route path="browse">
            <IndexRedirect to="/browse/models" />
            <Route path="metrics" component={BrowseMetrics} />
            <Route path="models" component={BrowseModels} />
            <Route path="databases" component={BrowseDatabases} />
            <Route path="databases/:slug" component={BrowseSchemas} />
            <Route
              path="databases/:dbId/schema/:schemaName"
              component={BrowseTables}
            />

            {PLUGIN_TABLE_EDITING.getRoutes()}

            {/* These two Redirects support legacy paths in v48 and earlier */}
            <Redirect from=":dbId-:slug" to="databases/:dbId-:slug" />
            <Redirect
              from=":dbId/schema/:schemaName"
              to="databases/:dbId/schema/:schemaName"
            />
          </Route>

          <Route path="explore" component={MetricsExplorerPage} />

          <Route path="table">
            <Route path=":tableId/detail/:rowId" component={TableDetailPage} />
          </Route>

          {/* INDIVIDUAL DASHBOARDS */}

          <Route path="/auto/dashboard/*" component={AutomaticDashboardApp} />

          {/* REFERENCE */}
          <Route path="/reference">
            <IndexRedirect to="/reference/databases" />
            <Route path="segments" component={SegmentListContainer} />
            <Route
              path="segments/:segmentId"
              component={SegmentDetailContainer}
            />
            <Route
              path="segments/:segmentId/fields"
              component={SegmentFieldListContainer}
            />
            <Route
              path="segments/:segmentId/fields/:fieldId"
              component={SegmentFieldDetailContainer}
            />
            <Route
              path="segments/:segmentId/questions"
              component={SegmentQuestionsContainer}
            />
            <Route
              path="segments/:segmentId/revisions"
              component={SegmentRevisionsContainer}
            />
            <Route path="databases" component={DatabaseListContainer} />
            <Route
              path="databases/:databaseId"
              component={DatabaseDetailContainer}
            />
            <Route
              path="databases/:databaseId/tables"
              component={TableListContainer}
            />
            <Route
              path="databases/:databaseId/tables/:tableId"
              component={TableDetailContainer}
            />
            <Route
              path="databases/:databaseId/tables/:tableId/fields"
              component={FieldListContainer}
            />
            <Route
              path="databases/:databaseId/tables/:tableId/fields/:fieldId"
              component={FieldDetailContainer}
            />
            <Route
              path="databases/:databaseId/tables/:tableId/questions"
              component={TableQuestionsContainer}
            />
            <Route path="glossary" component={GlossaryContainer} />
          </Route>

          {/* ACCOUNT */}
          {getAccountRoutes(store, IsAuthenticated)}

          {/* ADMIN */}
          {getAdminRoutes(store, CanAccessSettings, IsAdmin)}

          {/* DATA STUDIO */}
          {PLUGIN_DATA_STUDIO.getDataStudioRoutes(
            store,
            CanAccessDataStudio,
            CanAccessDataModel,
            CanAccessTransforms,
          )}
        </Route>
      </Route>

      {/* DEPRECATED */}
      {/* NOTE: these custom routes are needed because <Redirect> doesn't preserve the hash */}
      <Route
        path="/q"
        onEnter={({ location }, replace) =>
          replace({ pathname: "/question", hash: location.hash })
        }
      />
      <Route
        path="/card/:slug"
        onEnter={({ location, params }, replace) =>
          replace({
            pathname: `/question/${params.slug}`,
            hash: location.hash,
          })
        }
      />
      <Redirect from="/dash/:dashboardId" to="/dashboard/:dashboardId" />
      <Redirect
        from="/collections/permissions"
        to="/admin/permissions/collections"
      />

      {/* MISC */}
      <Route path="/unsubscribe" component={UnsubscribePage} />
      <Route path="/unauthorized" component={Unauthorized} />
      <Route path="/*" component={NotFoundFallbackPage} />
    </Route>
  );
};
