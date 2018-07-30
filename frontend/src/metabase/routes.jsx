/* @flow weak */

import React from "react";

import { Route } from "metabase/hoc/Title";
import { Redirect, IndexRedirect, IndexRoute } from "react-router";
import { routerActions } from "react-router-redux";
import { UserAuthWrapper } from "redux-auth-wrapper";
import { t } from "c-3po";

import { loadCurrentUser } from "metabase/redux/user";
import MetabaseSettings from "metabase/lib/settings";

import App from "metabase/App.jsx";

import HomepageApp from "metabase/home/containers/HomepageApp";

// auth containers
import AuthApp from "metabase/auth/AuthApp";
import ForgotPasswordApp from "metabase/auth/containers/ForgotPasswordApp.jsx";
import LoginApp from "metabase/auth/containers/LoginApp.jsx";
import LogoutApp from "metabase/auth/containers/LogoutApp.jsx";
import PasswordResetApp from "metabase/auth/containers/PasswordResetApp.jsx";
import GoogleNoAccount from "metabase/auth/components/GoogleNoAccount.jsx";

/* Dashboards */
import DashboardApp from "metabase/dashboard/containers/DashboardApp";
import AutomaticDashboardApp from "metabase/dashboard/containers/AutomaticDashboardApp";

import {
  BrowseApp,
  DatabaseBrowser,
  SchemaBrowser,
  TableBrowser,
} from "metabase/components/BrowseApp";

import QueryBuilder from "metabase/query_builder/containers/QueryBuilder.jsx";

import CollectionEdit from "metabase/collections/containers/CollectionEdit.jsx";
import CollectionCreate from "metabase/collections/containers/CollectionCreate.jsx";
import CollectionPermissions from "metabase/admin/permissions/containers/CollectionsPermissionsApp.jsx";
import ArchiveCollectionModal from "metabase/components/ArchiveCollectionModal";
import CollectionPermissionsModal from "metabase/admin/permissions/containers/CollectionPermissionsModal";
import UserCollectionList from "metabase/containers/UserCollectionList";

import PulseEditApp from "metabase/pulse/containers/PulseEditApp.jsx";
import PulseMoveModal from "metabase/pulse/components/PulseMoveModal";
import SetupApp from "metabase/setup/containers/SetupApp.jsx";
import PostSetupApp from "metabase/setup/containers/PostSetupApp.jsx";
import UserSettingsApp from "metabase/user/containers/UserSettingsApp.jsx";
import EntityPage from "metabase/components/EntityPage.jsx";
// new question
import {
  NewQuestionStart,
  NewQuestionMetricSearch,
} from "metabase/new_query/router_wrappers";

import CreateDashboardModal from "metabase/components/CreateDashboardModal";
import NotFound from "metabase/components/NotFound.jsx";
import Unauthorized from "metabase/components/Unauthorized.jsx";

// Reference Guide
import GettingStartedGuideContainer from "metabase/reference/guide/GettingStartedGuideContainer.jsx";
// Reference Metrics
import MetricListContainer from "metabase/reference/metrics/MetricListContainer.jsx";
import MetricDetailContainer from "metabase/reference/metrics/MetricDetailContainer.jsx";
import MetricQuestionsContainer from "metabase/reference/metrics/MetricQuestionsContainer.jsx";
import MetricRevisionsContainer from "metabase/reference/metrics/MetricRevisionsContainer.jsx";
// Reference Segments
import SegmentListContainer from "metabase/reference/segments/SegmentListContainer.jsx";
import SegmentDetailContainer from "metabase/reference/segments/SegmentDetailContainer.jsx";
import SegmentQuestionsContainer from "metabase/reference/segments/SegmentQuestionsContainer.jsx";
import SegmentRevisionsContainer from "metabase/reference/segments/SegmentRevisionsContainer.jsx";
import SegmentFieldListContainer from "metabase/reference/segments/SegmentFieldListContainer.jsx";
import SegmentFieldDetailContainer from "metabase/reference/segments/SegmentFieldDetailContainer.jsx";
// Reference Databases
import DatabaseListContainer from "metabase/reference/databases/DatabaseListContainer.jsx";
import DatabaseDetailContainer from "metabase/reference/databases/DatabaseDetailContainer.jsx";
import TableListContainer from "metabase/reference/databases/TableListContainer.jsx";
import TableDetailContainer from "metabase/reference/databases/TableDetailContainer.jsx";
import TableQuestionsContainer from "metabase/reference/databases/TableQuestionsContainer.jsx";
import FieldListContainer from "metabase/reference/databases/FieldListContainer.jsx";
import FieldDetailContainer from "metabase/reference/databases/FieldDetailContainer.jsx";

import getAdminRoutes from "metabase/admin/routes";

import PublicQuestion from "metabase/public/containers/PublicQuestion.jsx";
import PublicDashboard from "metabase/public/containers/PublicDashboard.jsx";
import { DashboardHistoryModal } from "metabase/dashboard/components/DashboardHistoryModal";
import DashboardMoveModal from "metabase/dashboard/components/DashboardMoveModal";
import { ModalRoute } from "metabase/hoc/ModalRoute";

import CollectionLanding from "metabase/components/CollectionLanding";
import Overworld from "metabase/containers/Overworld";

import ArchiveApp from "metabase/home/containers/ArchiveApp.jsx";
import SearchApp from "metabase/home/containers/SearchApp";

const MetabaseIsSetup = UserAuthWrapper({
  predicate: authData => !authData.hasSetupToken,
  failureRedirectPath: "/setup",
  authSelector: state => ({ hasSetupToken: MetabaseSettings.hasSetupToken() }), // HACK
  wrapperDisplayName: "MetabaseIsSetup",
  allowRedirectBack: false,
  redirectAction: routerActions.replace,
});

const UserIsAuthenticated = UserAuthWrapper({
  failureRedirectPath: "/auth/login",
  authSelector: state => state.currentUser,
  wrapperDisplayName: "UserIsAuthenticated",
  redirectAction: location =>
    // HACK: workaround for redux-auth-wrapper not including hash
    // https://github.com/mjrussell/redux-auth-wrapper/issues/121
    routerActions.replace({
      ...location,
      query: {
        ...location.query,
        redirect: location.query.redirect + (window.location.hash || ""),
      },
    }),
});

const UserIsAdmin = UserAuthWrapper({
  predicate: currentUser => currentUser && currentUser.is_superuser,
  failureRedirectPath: "/unauthorized",
  authSelector: state => state.currentUser,
  allowRedirectBack: false,
  wrapperDisplayName: "UserIsAdmin",
  redirectAction: routerActions.replace,
});

const UserIsNotAuthenticated = UserAuthWrapper({
  predicate: currentUser => !currentUser,
  failureRedirectPath: "/",
  authSelector: state => state.currentUser,
  allowRedirectBack: false,
  wrapperDisplayName: "UserIsNotAuthenticated",
  redirectAction: routerActions.replace,
});

const IsAuthenticated = MetabaseIsSetup(
  UserIsAuthenticated(({ children }) => children),
);
const IsAdmin = MetabaseIsSetup(
  UserIsAuthenticated(UserIsAdmin(({ children }) => children)),
);

const IsNotAuthenticated = MetabaseIsSetup(
  UserIsNotAuthenticated(({ children }) => children),
);

export const getRoutes = store => (
  <Route title="Metabase" component={App}>
    {/* SETUP */}
    <Route
      path="/setup"
      component={SetupApp}
      onEnter={(nextState, replace) => {
        if (!MetabaseSettings.hasSetupToken()) {
          replace("/");
        }
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
        done();
      }}
    >
      {/* AUTH */}
      <Route path="/auth" component={AuthApp}>
        <IndexRedirect to="/auth/login" />
        <Route component={IsNotAuthenticated}>
          <Route path="login" title={t`Login`} component={LoginApp} />
        </Route>
        <Route path="logout" component={LogoutApp} />
        <Route path="forgot_password" component={ForgotPasswordApp} />
        <Route path="reset_password/:token" component={PasswordResetApp} />
        <Route path="google_no_mb_account" component={GoogleNoAccount} />
      </Route>

      {/* MAIN */}
      <Route component={IsAuthenticated}>
        {/* The global all hands rotues, things in here are for all the folks */}
        <Route path="/" component={Overworld} />

        <Route path="/explore" component={PostSetupApp} />
        <Route path="/explore/:databaseId" component={PostSetupApp} />

        <Route path="search" title={t`Search`} component={SearchApp} />
        <Route path="archive" title={t`Archive`} component={ArchiveApp} />

        <Route path="collection/users" component={IsAdmin}>
          <IndexRoute component={UserCollectionList} />
        </Route>

        <Route path="collection/:collectionId" component={CollectionLanding}>
          <ModalRoute path="edit" modal={CollectionEdit} />
          <ModalRoute path="archive" modal={ArchiveCollectionModal} />
          <ModalRoute path="new_collection" modal={CollectionCreate} />
          <ModalRoute path="new_dashboard" modal={CreateDashboardModal} />
          <ModalRoute path="permissions" modal={CollectionPermissionsModal} />
        </Route>

        <Route path="activity" component={HomepageApp} />

        <Route
          path="dashboard/:dashboardId"
          title={t`Dashboard`}
          component={DashboardApp}
        >
          <ModalRoute path="history" modal={DashboardHistoryModal} />
          <ModalRoute path="move" modal={DashboardMoveModal} />
        </Route>

        <Route path="/question">
          <IndexRoute component={QueryBuilder} />
          {/* NEW QUESTION FLOW */}
          <Route path="new" title={t`New Question`}>
            <IndexRoute component={NewQuestionStart} />
            <Route
              path="metric"
              title={t`Metrics`}
              component={NewQuestionMetricSearch}
            />
          </Route>
        </Route>
        <Route path="/question/:cardId" component={QueryBuilder} />
        <Route path="/question/:cardId/entity" component={EntityPage} />

        <Route path="/ready" component={PostSetupApp} />

        <Route path="browse" component={BrowseApp}>
          <IndexRoute component={DatabaseBrowser} />
          <Route path=":dbId" component={SchemaBrowser} />
          <Route path=":dbId/schema/:schemaName" component={TableBrowser} />
        </Route>

        {/* INDIVIDUAL DASHBOARDS */}

        <Route path="/auto/dashboard/*" component={AutomaticDashboardApp} />
      </Route>

      <Route path="/collections">
        <Route path="create" component={CollectionCreate} />
        <Route path="permissions" component={CollectionPermissions} />
      </Route>

      {/* REFERENCE */}
      <Route path="/reference" title={`Data Reference`}>
        <IndexRedirect to="/reference/databases" />
        <Route
          path="guide"
          title={`Getting Started`}
          component={GettingStartedGuideContainer}
        />
        <Route path="metrics" component={MetricListContainer} />
        <Route path="metrics/:metricId" component={MetricDetailContainer} />
        <Route
          path="metrics/:metricId/questions"
          component={MetricQuestionsContainer}
        />
        <Route
          path="metrics/:metricId/revisions"
          component={MetricRevisionsContainer}
        />
        <Route path="segments" component={SegmentListContainer} />
        <Route path="segments/:segmentId" component={SegmentDetailContainer} />
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
          <ModalRoute path="move" modal={PulseMoveModal} />
        </Route>
      </Route>

      {/* USER */}
      <Route path="/user/edit_current" component={UserSettingsApp} />

      {/* ADMIN */}
      {getAdminRoutes(store, IsAdmin)}
    </Route>

    {/* INTERNAL */}
    <Route
      path="/_internal"
      getChildRoutes={(partialNextState, callback) =>
        // $FlowFixMe: flow doesn't know about require.ensure
        require.ensure([], require => {
          callback(null, [require("metabase/internal/routes").default]);
        })
      }
    />

    {/* DEPRECATED */}
    {/* NOTE: these custom routes are needed because <Redirect> doesn't preserve the hash */}
    <Route
      path="/q"
      onEnter={({ location }, replace) =>
        replace({ pathname: "/question", hash: location.hash })
      }
    />
    <Route
      path="/card/:cardId"
      onEnter={({ location, params }, replace) =>
        replace({
          pathname: `/question/${params.cardId}`,
          hash: location.hash,
        })
      }
    />
    <Redirect from="/dash/:dashboardId" to="/dashboard/:dashboardId" />

    {/* MISC */}
    <Route path="/unauthorized" component={Unauthorized} />
    <Route path="/*" component={NotFound} />
  </Route>
);
