import React from "react";
import { IndexRedirect, IndexRoute, Redirect } from "react-router";
import { t } from "ttag";

import { Route } from "metabase/hoc/Title";
import { PLUGIN_LANDING_PAGE } from "metabase/plugins";

import { loadCurrentUser } from "metabase/redux/user";
import MetabaseSettings from "metabase/lib/settings";

import App from "metabase/App.tsx";

import ActivityApp from "metabase/home/containers/ActivityApp";
import ModelMetabotApp from "metabase/metabot/containers/ModelMetabotApp";
import DatabaseMetabotApp from "metabase/metabot/containers/DatabaseMetabotApp";

// auth containers
import ForgotPasswordApp from "metabase/auth/containers/ForgotPasswordApp";
import LoginApp from "metabase/auth/containers/LoginApp";
import LogoutApp from "metabase/auth/containers/LogoutApp";
import ResetPasswordApp from "metabase/auth/containers/ResetPasswordApp";

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
import SetupApp from "metabase/setup/containers/SetupApp";

import NewModelOptions from "metabase/models/containers/NewModelOptions";

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

import PublicQuestion from "metabase/public/containers/PublicQuestion";
import PublicDashboard from "metabase/public/containers/PublicDashboard";
import ArchiveDashboardModal from "metabase/dashboard/containers/ArchiveDashboardModal";
import DashboardMoveModal from "metabase/dashboard/components/DashboardMoveModal";
import DashboardCopyModal from "metabase/dashboard/components/DashboardCopyModal";
import { ModalRoute } from "metabase/hoc/ModalRoute";

import HomePageApp from "metabase/home/homepage/containers/HomePageApp";
import CollectionLanding from "metabase/collections/components/CollectionLanding";

import ArchiveApp from "metabase/home/containers/ArchiveApp";
import SearchApp from "metabase/home/containers/SearchApp";
import { trackPageView } from "metabase/lib/analytics";
import {
  CanAccessMetabot,
  CanAccessSettings,
  IsAdmin,
  IsAuthenticated,
  IsNotAuthenticated,
} from "./route-guards";

export const getRoutes = store => (
  <Route title={t`Metabase`} component={App}>
    {/* SETUP */}
    <Route
      path="/setup"
      component={SetupApp}
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

    {/* PUBLICLY SHARED LINKS */}
    <Route path="public">
      <Route path="question/:uuid" component={PublicQuestion} />
      <Route path="dashboard/:uuid" component={PublicDashboard} />
    </Route>

    {/* APP */}
    <Route
      onEnter={async (nextState, replace, done) => {
        await store.dispatch(loadCurrentUser());
        trackPageView(nextState.location.pathname);
        done();
      }}
      onChange={(prevState, nextState) => {
        trackPageView(nextState.location.pathname);
      }}
    >
      {/* AUTH */}
      <Route path="/auth">
        <IndexRedirect to="/auth/login" />
        <Route component={IsNotAuthenticated}>
          <Route path="login" title={t`Login`} component={LoginApp} />
          <Route path="login/:provider" title={t`Login`} component={LoginApp} />
        </Route>
        <Route path="logout" component={LogoutApp} />
        <Route path="forgot_password" component={ForgotPasswordApp} />
        <Route path="reset_password/:token" component={ResetPasswordApp} />
      </Route>

      {/* MAIN */}
      <Route component={IsAuthenticated}>
        {/* The global all hands routes, things in here are for all the folks */}
        <Route
          path="/"
          component={HomePageApp}
          onEnter={(nextState, replace) => {
            const page = PLUGIN_LANDING_PAGE[0] && PLUGIN_LANDING_PAGE[0]();
            if (page && page !== "/") {
              replace(page);
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

        <Route path="activity" component={ActivityApp} />

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
          <Route path="new" title={t`New Model`} component={NewModelOptions} />
          <Route path="notebook" component={QueryBuilder} />
          <Route path=":slug" component={QueryBuilder} />
          <Route path=":slug/notebook" component={QueryBuilder} />
          <Route path=":slug/query" component={QueryBuilder} />
          <Route path=":slug/metadata" component={QueryBuilder} />
          <Route path=":slug/metabot" component={QueryBuilder} />
          <Route path=":slug/:objectId" component={QueryBuilder} />
          <Route path="query" component={QueryBuilder} />
          <Route path="metabot" component={QueryBuilder} />
        </Route>

        <Route path="browse" component={BrowseApp}>
          <IndexRoute component={DatabaseBrowser} />
          <Route path=":slug" component={SchemaBrowser} />
          <Route path=":dbId/schema/:schemaName" component={TableBrowser} />
        </Route>

        {/* INDIVIDUAL DASHBOARDS */}

        <Route path="/auto/dashboard/*" component={AutomaticDashboardApp} />

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

        {/* PULSE */}
        <Route path="/pulse" title={t`Pulses`}>
          {/* NOTE: legacy route, not linked to in app */}
          <IndexRedirect to="/search" query={{ type: "pulse" }} />
          <Route path="create" component={PulseEditApp} />
          <Route path=":pulseId">
            <IndexRoute component={PulseEditApp} />
          </Route>
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
    <Route path="/unauthorized" component={Unauthorized} />
    <Route path="/*" component={NotFoundFallbackPage} />
  </Route>
);
