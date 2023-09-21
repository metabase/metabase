import PropTypes from "prop-types";
import { useAsync } from "react-use";
import { Redirect, Switch } from "react-router-dom";
import { t } from "ttag";

import { Route } from "metabase/hoc/Title";
import { PLUGIN_LANDING_PAGE } from "metabase/plugins";

import { loadCurrentUser } from "metabase/redux/user";
import MetabaseSettings from "metabase/lib/settings";

import App from "metabase/App.tsx";

import ModelMetabotApp from "metabase/metabot/containers/ModelMetabotApp";
import DatabaseMetabotApp from "metabase/metabot/containers/DatabaseMetabotApp";

// auth containers
import { ForgotPassword } from "metabase/auth/components/ForgotPassword";
import { Login } from "metabase/auth/components/Login";
import { Logout } from "metabase/auth/components/Logout";
import { ResetPassword } from "metabase/auth/components/ResetPassword";

/* Dashboards */
import DashboardApp from "metabase/dashboard/containers/DashboardApp";
import AutomaticDashboardApp from "metabase/dashboard/containers/AutomaticDashboardApp";

/* Browse data */
import BrowseApp from "metabase/browse/components/BrowseApp";
import DatabaseBrowser from "metabase/browse/containers/DatabaseBrowser";
import SchemaBrowser from "metabase/browse/containers/SchemaBrowser";
import TableBrowser from "metabase/browse/containers/TableBrowser";

import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";

import MoveCollectionModal from "metabase/collections/containers/MoveCollectionModal";
import ArchiveCollectionModal from "metabase/components/ArchiveCollectionModal";
import CollectionPermissionsModal from "metabase/admin/permissions/components/CollectionPermissionsModal/CollectionPermissionsModal";
import UserCollectionList from "metabase/containers/UserCollectionList";

import PulseEditApp from "metabase/pulse/containers/PulseEditApp";
import { Setup } from "metabase/setup/components/Setup";

import NewModelOptions from "metabase/models/containers/NewModelOptions";

import { UnsubscribePage } from "metabase/containers/Unsubscribe";
import { Unauthorized } from "metabase/containers/ErrorPages";
import NotFoundFallbackPage from "metabase/containers/NotFoundFallbackPage";

// Reference Metrics
import MetricListContainer from "metabase/reference/metrics/MetricListContainer";
import MetricDetailContainer from "metabase/reference/metrics/MetricDetailContainer";
import MetricQuestionsContainer from "metabase/reference/metrics/MetricQuestionsContainer";
import MetricRevisionsContainer from "metabase/reference/metrics/MetricRevisionsContainer";

// Reference Segments
import SegmentListContainer from "metabase/reference/segments/SegmentListContainer";
import SegmentDetailContainer from "metabase/reference/segments/SegmentDetailContainer";
import SegmentQuestionsContainer from "metabase/reference/segments/SegmentQuestionsContainer";
import SegmentRevisionsContainer from "metabase/reference/segments/SegmentRevisionsContainer";
import SegmentFieldListContainer from "metabase/reference/segments/SegmentFieldListContainer";
import SegmentFieldDetailContainer from "metabase/reference/segments/SegmentFieldDetailContainer";

// Reference Databases
import DatabaseListContainer from "metabase/reference/databases/DatabaseListContainer";
import DatabaseDetailContainer from "metabase/reference/databases/DatabaseDetailContainer";
import TableListContainer from "metabase/reference/databases/TableListContainer";
import TableDetailContainer from "metabase/reference/databases/TableDetailContainer";
import TableQuestionsContainer from "metabase/reference/databases/TableQuestionsContainer";
import FieldListContainer from "metabase/reference/databases/FieldListContainer";
import FieldDetailContainer from "metabase/reference/databases/FieldDetailContainer";

import getAccountRoutes from "metabase/account/routes";
import getAdminRoutes from "metabase/admin/routes";
import getCollectionTimelineRoutes from "metabase/timelines/collections/routes";
import { getRoutes as getModelRoutes } from "metabase/models/routes";

import { PublicQuestion } from "metabase/public/containers/PublicQuestion";
import PublicDashboard from "metabase/public/containers/PublicDashboard";
import ArchiveDashboardModal from "metabase/dashboard/containers/ArchiveDashboardModal";
import DashboardMoveModal from "metabase/dashboard/components/DashboardMoveModal";
import DashboardCopyModal from "metabase/dashboard/components/DashboardCopyModal";
import { ModalRoute } from "metabase/hoc/ModalRoute";

import { HomePage } from "metabase/home/components/HomePage";
import CollectionLanding from "metabase/collections/components/CollectionLanding";

import { ArchiveApp } from "metabase/archive/containers/ArchiveApp";
import SearchApp from "metabase/search/containers/SearchApp";
import { useTrackPageView } from "metabase/lib/analytics";
import {
  CanAccessMetabot,
  CanAccessSettings,
  IsAdmin,
  IsAuthenticated,
  IsNotAuthenticated,
  UserIsNotAuthenticated,
} from "./route-guards";

export const getRoutes = store => (
  <Route title={t`Metabase`} component={App}>
    <Switch>
      {/* SETUP */}
      <Route
        path="/setup"
        render={() => {
          if (MetabaseSettings.hasUserSetup()) {
            return <Redirect to="/" />;
          }

          return <Setup />;
        }}
      />

      {/* PUBLICLY SHARED LINKS */}
      <Route path="public">
        <Route path="question/:uuid" component={PublicQuestion} />
        <Route path="dashboard/:uuid(/:tabSlug)" component={PublicDashboard} />
      </Route>

      <AppRoutes store={store} />

      {/* DEPRECATED */}
      {/* NOTE: these custom routes are needed because <Redirect> doesn't preserve the hash */}
      <Route
        path="/q"
        render={({ location }) => {
          return (
            <Redirect to={{ pathname: "/question", hash: location.hash }} />
          );
        }}
      />
      <Route
        path="/card/:slug"
        render={({ location, match }) => {
          return (
            <Redirect
              to={{
                pathname: `/question/${match.params.slug}`,
                hash: location.hash,
              }}
            />
          );
        }}
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
    </Switch>
  </Route>
);

const AppRoutes = ({ store }) => {
  useTrackPageView();

  const { loading } = useAsync(() => store.dispatch(loadCurrentUser()));

  if (loading) {
    return null;
  }

  return (
    <Switch>
      {/* AUTH */}
      <Route
        path="/auth/login"
        render={() => (
          <IsNotAuthenticated>
            <Login />
          </IsNotAuthenticated>
        )}
        title={t`Login`}
      />
      <Route
        path="/auth/login/:provider"
        render={() => (
          <IsNotAuthenticated>
            <Login />
          </IsNotAuthenticated>
        )}
        title={t`Login`}
      />
      <Route path="/auth/logout" component={Logout} />
      <Route path="/auth/forgot_password" component={ForgotPassword} />
      <Route path="/auth/reset_password/:token" component={ResetPassword} />
      <Route path="/auth/*">
        <Redirect to="/auth/login" />
      </Route>

      {/* MAIN */}
      <Route
        exact
        path="/"
        render={() => {
          const page = PLUGIN_LANDING_PAGE[0] && PLUGIN_LANDING_PAGE[0]();

          if (page && page !== "/") {
            return (
              <Redirect to={page} />
            );
          }

          return (
            // <IsAuthenticated>
              <HomePage />
            // </IsAuthenticated>
          );
        }}
      />
    </Switch>
  );

  // eslint-disable-next-line no-unreachable
  return (
    <Switch>
      {/* MAIN */}
      <Route component={IsAuthenticated}>
        {/* The global all hands routes, things in here are for all the folks */}

        <Route path="search" title={t`Search`} component={SearchApp} />
        <Route path="archive" title={t`Archive`} component={ArchiveApp} />

        <Route path="collection/users" component={IsAdmin}>
          <Route path="/" component={UserCollectionList} />
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
          component={DashboardApp}
        >
          <ModalRoute path="move" modal={DashboardMoveModal} />
          <ModalRoute path="copy" modal={DashboardCopyModal} />
          <ModalRoute path="archive" modal={ArchiveDashboardModal} />
        </Route>

        <Route path="/question">
          <Route exact path="/" component={QueryBuilder} />
          <Route exact path="notebook" component={QueryBuilder} />
          <Route exact path=":slug" component={QueryBuilder} />
          <Route exact path=":slug/notebook" component={QueryBuilder} />
          <Route exact path=":slug/metabot" component={QueryBuilder} />
          <Route exact path=":slug/:objectId" component={QueryBuilder} />
        </Route>

        <Route path="/metabot" component={CanAccessMetabot}>
          <Route path="database/:databaseId" component={DatabaseMetabotApp} />
          <Route path="model/:slug" component={ModelMetabotApp} />
        </Route>

        {/* MODELS */}
        {/* {getModelRoutes()} */}

        <Route path="/model">
          <Route exact path="/" component={QueryBuilder} />
          <Route
            exact
            path="new"
            title={t`New Model`}
            component={NewModelOptions}
          />
          <Route exact path="notebook" component={QueryBuilder} />
          <Route exact path=":slug" component={QueryBuilder} />
          <Route exact path=":slug/notebook" component={QueryBuilder} />
          <Route exact path=":slug/query" component={QueryBuilder} />
          <Route exact path=":slug/metadata" component={QueryBuilder} />
          <Route exact path=":slug/metabot" component={QueryBuilder} />
          <Route exact path=":slug/:objectId" component={QueryBuilder} />
          <Route exact path="query" component={QueryBuilder} />
          <Route exact path="metabot" component={QueryBuilder} />
        </Route>

        <Route path="browse" component={BrowseApp}>
          <Route exact path="/" component={DatabaseBrowser} />
          <Route exact path=":slug" component={SchemaBrowser} />
          <Route
            exact
            path=":dbId/schema/:schemaName"
            component={TableBrowser}
          />
        </Route>

        {/* INDIVIDUAL DASHBOARDS */}

        <Route path="/auto/dashboard/*" component={AutomaticDashboardApp} />

        {/* REFERENCE */}
        <Route path="/reference" title={t`Data Reference`}>
          <Route exact path="/">
            <Redirect to="/reference/databases" />
          </Route>
          <Route exact path="metrics" component={MetricListContainer} />
          <Route
            exact
            path="metrics/:metricId"
            component={MetricDetailContainer}
          />
          <Route
            exact
            path="metrics/:metricId/edit"
            component={MetricDetailContainer}
          />
          <Route
            exact
            path="metrics/:metricId/questions"
            component={MetricQuestionsContainer}
          />
          <Route
            exact
            path="metrics/:metricId/revisions"
            component={MetricRevisionsContainer}
          />
          <Route exact path="segments" component={SegmentListContainer} />
          <Route
            exact
            path="segments/:segmentId"
            component={SegmentDetailContainer}
          />
          <Route
            exact
            path="segments/:segmentId/fields"
            component={SegmentFieldListContainer}
          />
          <Route
            exact
            path="segments/:segmentId/fields/:fieldId"
            component={SegmentFieldDetailContainer}
          />
          <Route
            exact
            path="segments/:segmentId/questions"
            component={SegmentQuestionsContainer}
          />
          <Route
            exact
            path="segments/:segmentId/revisions"
            component={SegmentRevisionsContainer}
          />
          <Route exact path="databases" component={DatabaseListContainer} />
          <Route
            exact
            path="databases/:databaseId"
            component={DatabaseDetailContainer}
          />
          <Route
            exact
            path="databases/:databaseId/tables"
            component={TableListContainer}
          />
          <Route
            exact
            path="databases/:databaseId/tables/:tableId"
            component={TableDetailContainer}
          />
          <Route
            exact
            path="databases/:databaseId/tables/:tableId/fields"
            component={FieldListContainer}
          />
          <Route
            exact
            path="databases/:databaseId/tables/:tableId/fields/:fieldId"
            component={FieldDetailContainer}
          />
          <Route
            exact
            path="databases/:databaseId/tables/:tableId/questions"
            component={TableQuestionsContainer}
          />
        </Route>

        {/* PULSE */}
        <Route path="/pulse" title={t`Pulses`}>
          {/* NOTE: legacy route, not linked to in app */}
          <Route exact path="/">
            <Redirect to="/search" query={{ type: "pulse" }} />
          </Route>
          <Route exact path="create" component={PulseEditApp} />
          <Route exact path=":pulseId" component={PulseEditApp} />
        </Route>

        {/* ACCOUNT */}
        {/* {getAccountRoutes(store, IsAuthenticated)} */}

        {/* ADMIN */}
        {/* {getAdminRoutes(store, CanAccessSettings, IsAdmin)} */}
      </Route>
    </Switch>
  );
};

AppRoutes.propTypes = {
  store: PropTypes.object.isRequired,
};
