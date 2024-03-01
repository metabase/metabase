import { IndexRedirect, IndexRoute, Redirect } from "react-router";
import { t } from "ttag";

import App from "metabase/App.tsx";
import getAccountRoutes from "metabase/account/routes";
import CollectionPermissionsModal from "metabase/admin/permissions/components/CollectionPermissionsModal/CollectionPermissionsModal";
import getAdminRoutes from "metabase/admin/routes";
import { ArchiveApp } from "metabase/archive/containers/ArchiveApp";
import { ForgotPassword } from "metabase/auth/components/ForgotPassword";
import { Login } from "metabase/auth/components/Login";
import { Logout } from "metabase/auth/components/Logout";
import { ResetPassword } from "metabase/auth/components/ResetPassword";
import { BrowseApp } from "metabase/browse/components/BrowseApp";
import SchemaBrowser from "metabase/browse/components/SchemaBrowser";
import TableBrowser from "metabase/browse/containers/TableBrowser";
import CollectionLanding from "metabase/collections/components/CollectionLanding";
import MoveCollectionModal from "metabase/collections/containers/MoveCollectionModal";
import ArchiveCollectionModal from "metabase/components/ArchiveCollectionModal";
import { Unauthorized } from "metabase/containers/ErrorPages";
import NotFoundFallbackPage from "metabase/containers/NotFoundFallbackPage";
import { UnsubscribePage } from "metabase/containers/Unsubscribe";
import { UserCollectionList } from "metabase/containers/UserCollectionList";
import { DashboardCopyModalConnected } from "metabase/dashboard/components/DashboardCopyModal";
import { DashboardMoveModalConnected } from "metabase/dashboard/components/DashboardMoveModal";
import { ArchiveDashboardModalConnected } from "metabase/dashboard/containers/ArchiveDashboardModal";
import { AutomaticDashboardAppConnected } from "metabase/dashboard/containers/AutomaticDashboardApp";
import { DashboardAppConnected } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import { Route } from "metabase/hoc/Title";
import { HomePage } from "metabase/home/components/HomePage";
import { trackPageView } from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";
import DatabaseMetabotApp from "metabase/metabot/containers/DatabaseMetabotApp";
import ModelMetabotApp from "metabase/metabot/containers/ModelMetabotApp";
import NewModelOptions from "metabase/models/containers/NewModelOptions";
import { getRoutes as getModelRoutes } from "metabase/models/routes";
import { PLUGIN_LANDING_PAGE } from "metabase/plugins";
import PublicDashboard from "metabase/public/containers/PublicDashboard";
import { PublicQuestion } from "metabase/public/containers/PublicQuestion";
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { loadCurrentUser } from "metabase/redux/user";
import DatabaseDetailContainer from "metabase/reference/databases/DatabaseDetailContainer";
import DatabaseListContainer from "metabase/reference/databases/DatabaseListContainer";
import FieldDetailContainer from "metabase/reference/databases/FieldDetailContainer";
import FieldListContainer from "metabase/reference/databases/FieldListContainer";
import TableDetailContainer from "metabase/reference/databases/TableDetailContainer";
import TableListContainer from "metabase/reference/databases/TableListContainer";
import TableQuestionsContainer from "metabase/reference/databases/TableQuestionsContainer";
import MetricDetailContainer from "metabase/reference/metrics/MetricDetailContainer";
import MetricListContainer from "metabase/reference/metrics/MetricListContainer";
import MetricQuestionsContainer from "metabase/reference/metrics/MetricQuestionsContainer";
import MetricRevisionsContainer from "metabase/reference/metrics/MetricRevisionsContainer";
import SegmentDetailContainer from "metabase/reference/segments/SegmentDetailContainer";
import SegmentFieldDetailContainer from "metabase/reference/segments/SegmentFieldDetailContainer";
import SegmentFieldListContainer from "metabase/reference/segments/SegmentFieldListContainer";
import SegmentListContainer from "metabase/reference/segments/SegmentListContainer";
import SegmentQuestionsContainer from "metabase/reference/segments/SegmentQuestionsContainer";
import SegmentRevisionsContainer from "metabase/reference/segments/SegmentRevisionsContainer";
import SearchApp from "metabase/search/containers/SearchApp";
import { Setup } from "metabase/setup/components/Setup";
import getCollectionTimelineRoutes from "metabase/timelines/collections/routes";

import { BrowseRedirect } from "./browse/components/BrowseRedirect";
import { SubscriptionsDashboard } from "./dashboard/components/SubscriptionsDashboard";
import {
  CanAccessMetabot,
  CanAccessSettings,
  IsAdmin,
  IsAuthenticated,
  IsNotAuthenticated,
} from "./route-guards";
import { getApplicationName } from "./selectors/whitelabel";

export const getRoutes = store => {
  const applicationName = getApplicationName(store.getState());
  return (
    <Route title={applicationName} component={App}>
      {/* SETUP */}
      <Route
        path="/setup"
        component={Setup}
        onEnter={(nextState, replace) => {
          if (MetabaseSettings.hasUserSetup()) {
            replace("/");
          }
          trackPageView(location.pathname);
        }}
        onChange={(prevState, nextState) => {
          trackPageView(nextState.location.pathname);
        }}
      />

      <Route
        path="/subscriptions_dashboard"
        component={SubscriptionsDashboard}
      />

      {/* PUBLICLY SHARED LINKS */}
      <Route path="public">
        <Route path="question/:uuid" component={PublicQuestion} />
        <Route path="dashboard/:uuid(/:tabSlug)" component={PublicDashboard} />
      </Route>

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
            <Route path="login" title={t`Login`} component={Login} />
            <Route path="login/:provider" title={t`Login`} component={Login} />
          </Route>
          <Route path="logout" component={Logout} />
          <Route path="forgot_password" component={ForgotPassword} />
          <Route path="reset_password/:token" component={ResetPassword} />
        </Route>

        {/* MAIN */}
        <Route component={IsAuthenticated}>
          {/* The global all hands routes, things in here are for all the folks */}
          <Route
            path="/"
            component={HomePage}
            onEnter={(nextState, replace) => {
              const page = PLUGIN_LANDING_PAGE[0] && PLUGIN_LANDING_PAGE[0]();
              if (page && page !== "/") {
                replace({
                  pathname: page[0] === "/" ? page : `/${page}`,
                  state: { preserveNavbarState: true },
                });
              }
            }}
          />

          <Route path="search" title={t`Search`} component={SearchApp} />
          <Route path="archive" title={t`Archive`} component={ArchiveApp} />

          <Route path="collection/users" component={IsAdmin}>
            <IndexRoute component={UserCollectionList} />
          </Route>

          <Route path="collection/:slug" component={CollectionLanding}>
            <ModalRoute path="move" modal={MoveCollectionModal} />
            <ModalRoute path="archive" modal={ArchiveCollectionModal} />
            <ModalRoute path="permissions" modal={CollectionPermissionsModal} />
            {getCollectionTimelineRoutes()}
          </Route>

          <Route
            path="dashboard/:slug"
            title={t`Dashboard`}
            component={DashboardAppConnected}
          >
            <ModalRoute path="move" modal={DashboardMoveModalConnected} />
            <ModalRoute path="copy" modal={DashboardCopyModalConnected} />
            <ModalRoute path="archive" modal={ArchiveDashboardModalConnected} />
          </Route>

          <Route path="/question">
            <IndexRoute component={QueryBuilder} />
            <Route path="notebook" component={QueryBuilder} />
            <Route path=":slug" component={QueryBuilder} />
            <Route path=":slug/notebook" component={QueryBuilder} />
            <Route path=":slug/metabot" component={QueryBuilder} />
            <Route path=":slug/:objectId" component={QueryBuilder} />
          </Route>

          <Route path="/metabot" component={CanAccessMetabot}>
            <Route path="database/:databaseId" component={DatabaseMetabotApp} />
            <Route path="model/:slug" component={ModelMetabotApp} />
          </Route>

          {/* MODELS */}
          {getModelRoutes()}

          <Route path="/model">
            <IndexRoute component={QueryBuilder} />
            <Route
              path="new"
              title={t`New Model`}
              component={NewModelOptions}
            />
            <Route path=":slug" component={QueryBuilder} />
            <Route path=":slug/notebook" component={QueryBuilder} />
            <Route path=":slug/query" component={QueryBuilder} />
            <Route path=":slug/metadata" component={QueryBuilder} />
            <Route path=":slug/metabot" component={QueryBuilder} />
            <Route path=":slug/:objectId" component={QueryBuilder} />
            <Route path="query" component={QueryBuilder} />
            <Route path="metabot" component={QueryBuilder} />
          </Route>

          <Route path="browse">
            <IndexRoute component={BrowseRedirect} />
            <Route path="models" component={() => <BrowseApp tab="models" />} />
            <Route
              path="databases"
              component={() => <BrowseApp tab="databases" />}
            />
            <Route
              path="databases/:slug"
              component={({ params }) => (
                <BrowseApp tab="databases">
                  <SchemaBrowser params={params} />
                </BrowseApp>
              )}
            />
            <Route
              path="databases/:dbId/schema/:schemaName"
              component={({ params }) => (
                <BrowseApp tab="databases">
                  <TableBrowser params={params} />
                </BrowseApp>
              )}
            />

            {/* These two Redirects support legacy paths in v48 and earlier */}
            <Redirect from=":dbId-:slug" to="databases/:dbId-:slug" />
            <Redirect
              from=":dbId/schema/:schemaName"
              to="databases/:dbId/schema/:schemaName"
            />
          </Route>

          {/* INDIVIDUAL DASHBOARDS */}

          <Route
            path="/auto/dashboard/*"
            component={AutomaticDashboardAppConnected}
          />

          {/* REFERENCE */}
          <Route path="/reference" title={t`Data Reference`}>
            <IndexRedirect to="/reference/databases" />
            <Route path="metrics" component={MetricListContainer} />
            <Route path="metrics/:metricId" component={MetricDetailContainer} />
            <Route
              path="metrics/:metricId/edit"
              component={MetricDetailContainer}
            />
            <Route
              path="metrics/:metricId/questions"
              component={MetricQuestionsContainer}
            />
            <Route
              path="metrics/:metricId/revisions"
              component={MetricRevisionsContainer}
            />
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
          </Route>

          {/* ACCOUNT */}
          {getAccountRoutes(store, IsAuthenticated)}

          {/* ADMIN */}
          {getAdminRoutes(store, CanAccessSettings, IsAdmin)}
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
