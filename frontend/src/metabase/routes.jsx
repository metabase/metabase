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

// auth containers
import ForgotPasswordApp from "metabase/auth/containers/ForgotPasswordApp.jsx";
import LoginApp from "metabase/auth/containers/LoginApp.jsx";
import LogoutApp from "metabase/auth/containers/LogoutApp.jsx";
import PasswordResetApp from "metabase/auth/containers/PasswordResetApp.jsx";
import GoogleNoAccount from "metabase/auth/components/GoogleNoAccount.jsx";

// main app containers
import HomepageApp from "metabase/home/containers/HomepageApp.jsx";
import Dashboards from "metabase/dashboards/containers/Dashboards.jsx";
import DashboardsArchive from "metabase/dashboards/containers/DashboardsArchive.jsx";
import DashboardApp from "metabase/dashboard/containers/DashboardApp.jsx";
import AutomaticDashboardApp from "metabase/dashboard/containers/AutomaticDashboardApp.jsx";

import QuestionIndex from "metabase/questions/containers/QuestionIndex.jsx";
import Archive from "metabase/questions/containers/Archive.jsx";
import CollectionPage from "metabase/questions/containers/CollectionPage.jsx";
import CollectionEdit from "metabase/questions/containers/CollectionEdit.jsx";
import CollectionCreate from "metabase/questions/containers/CollectionCreate.jsx";
import SearchResults from "metabase/questions/containers/SearchResults.jsx";
import CollectionPermissions from "metabase/admin/permissions/containers/CollectionsPermissionsApp.jsx";
import EntityList from "metabase/questions/containers/EntityList.jsx";

import PulseEditApp from "metabase/pulse/containers/PulseEditApp.jsx";
import PulseListApp from "metabase/pulse/containers/PulseListApp.jsx";
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder.jsx";
import SetupApp from "metabase/setup/containers/SetupApp.jsx";
import PostSetupApp from "metabase/setup/containers/PostSetupApp.jsx";
import UserSettingsApp from "metabase/user/containers/UserSettingsApp.jsx";

// new question
import {
  NewQuestionStart,
  NewQuestionMetricSearch,
} from "metabase/new_query/router_wrappers";

// admin containers
import DatabaseListApp from "metabase/admin/databases/containers/DatabaseListApp.jsx";
import DatabaseEditApp from "metabase/admin/databases/containers/DatabaseEditApp.jsx";
import MetadataEditorApp from "metabase/admin/datamodel/containers/MetadataEditorApp.jsx";
import MetricApp from "metabase/admin/datamodel/containers/MetricApp.jsx";
import SegmentApp from "metabase/admin/datamodel/containers/SegmentApp.jsx";
import RevisionHistoryApp from "metabase/admin/datamodel/containers/RevisionHistoryApp.jsx";
import AdminPeopleApp from "metabase/admin/people/containers/AdminPeopleApp.jsx";
import SettingsEditorApp from "metabase/admin/settings/containers/SettingsEditorApp.jsx";
import FieldApp from "metabase/admin/datamodel/containers/FieldApp.jsx";
import TableSettingsApp from "metabase/admin/datamodel/containers/TableSettingsApp.jsx";

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

/* XRay */
import FieldXRay from "metabase/xray/containers/FieldXray.jsx";
import TableXRay from "metabase/xray/containers/TableXRay.jsx";
import SegmentXRay from "metabase/xray/containers/SegmentXRay.jsx";
import CardXRay from "metabase/xray/containers/CardXRay.jsx";
import {
  SharedTypeComparisonXRay,
  TwoTypesComparisonXRay,
} from "metabase/xray/containers/TableLikeComparison";

import getAdminPermissionsRoutes from "metabase/admin/permissions/routes.jsx";

import PeopleListingApp from "metabase/admin/people/containers/PeopleListingApp.jsx";
import GroupsListingApp from "metabase/admin/people/containers/GroupsListingApp.jsx";
import GroupDetailApp from "metabase/admin/people/containers/GroupDetailApp.jsx";

import PublicQuestion from "metabase/public/containers/PublicQuestion.jsx";
import PublicDashboard from "metabase/public/containers/PublicDashboard.jsx";
import { DashboardHistoryModal } from "metabase/dashboard/components/DashboardHistoryModal";
import { ModalRoute } from "metabase/hoc/ModalRoute";

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
      <Route path="/auth">
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
        {/* HOME */}
        <Route path="/" component={HomepageApp} />
        <Route path="/explore" component={PostSetupApp} />
        <Route path="/explore/:databaseId" component={PostSetupApp} />

        {/* DASHBOARD LIST */}
        <Route
          path="/dashboards"
          title={t`Dashboards`}
          component={Dashboards}
        />
        <Route
          path="/dashboards/archive"
          title={t`Dashboards`}
          component={DashboardsArchive}
        />

        {/* INDIVIDUAL DASHBOARDS */}
        <Route
          path="/dashboard/:dashboardId"
          title={t`Dashboard`}
          component={DashboardApp}
        >
          <ModalRoute path="history" modal={DashboardHistoryModal} />
        </Route>

        <Route path="/auto/dashboard/*" component={AutomaticDashboardApp} />

        {/* QUERY BUILDER */}
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

        {/* QUESTIONS */}
        <Route path="/questions" title={t`Questions`}>
          <IndexRoute component={QuestionIndex} />
          <Route
            path="search"
            title={({ location: { query: { q } } }) => t`Search` + ": " + q}
            component={SearchResults}
          />
          <Route path="archive" title={t`Archive`} component={Archive} />
          <Route
            path="collections/:collectionSlug"
            component={CollectionPage}
          />
        </Route>

        <Route
          path="/entities/:entityType"
          component={({ location, params }) => (
            <div className="p4">
              <EntityList
                entityType={params.entityType}
                entityQuery={location.query}
              />
            </div>
          )}
        />

        <Route path="/collections">
          <Route path="create" component={CollectionCreate} />
          <Route path="permissions" component={CollectionPermissions} />
          <Route path=":collectionId" component={CollectionEdit} />
        </Route>

        {/* REFERENCE */}
        <Route path="/reference" title={`Data Reference`}>
          <IndexRedirect to="/reference/guide" />
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

        {/* XRAY */}
        <Route path="/xray" title={t`XRay`}>
          <Route path="segment/:segmentId/:cost" component={SegmentXRay} />
          <Route path="table/:tableId/:cost" component={TableXRay} />
          <Route path="field/:fieldId/:cost" component={FieldXRay} />
          <Route path="card/:cardId/:cost" component={CardXRay} />
          <Route
            path="compare/:modelTypePlural/:modelId1/:modelId2/:cost"
            component={SharedTypeComparisonXRay}
          />
          <Route
            path="compare/:modelType1/:modelId1/:modelType2/:modelId2/:cost"
            component={TwoTypesComparisonXRay}
          />
        </Route>

        {/* PULSE */}
        <Route path="/pulse" title={t`Pulses`}>
          <IndexRoute component={PulseListApp} />
          <Route path="create" component={PulseEditApp} />
          <Route path=":pulseId" component={PulseEditApp} />
        </Route>

        {/* USER */}
        <Route path="/user/edit_current" component={UserSettingsApp} />
      </Route>

      {/* ADMIN */}
      <Route path="/admin" title={t`Admin`} component={IsAdmin}>
        <IndexRedirect to="/admin/settings" />

        <Route path="databases" title={t`Databases`}>
          <IndexRoute component={DatabaseListApp} />
          <Route path="create" component={DatabaseEditApp} />
          <Route path=":databaseId" component={DatabaseEditApp} />
        </Route>

        <Route path="datamodel" title={t`Data Model`}>
          <IndexRedirect to="database" />
          <Route path="database" component={MetadataEditorApp} />
          <Route path="database/:databaseId" component={MetadataEditorApp} />
          <Route
            path="database/:databaseId/:mode"
            component={MetadataEditorApp}
          />
          <Route
            path="database/:databaseId/:mode/:tableId"
            component={MetadataEditorApp}
          />
          <Route
            path="database/:databaseId/:mode/:tableId/settings"
            component={TableSettingsApp}
          />
          <Route
            path="database/:databaseId/:mode/:tableId/:fieldId"
            component={FieldApp}
          />
          <Route path="metric/create" component={MetricApp} />
          <Route path="metric/:id" component={MetricApp} />
          <Route path="segment/create" component={SegmentApp} />
          <Route path="segment/:id" component={SegmentApp} />
          <Route path=":entity/:id/revisions" component={RevisionHistoryApp} />
        </Route>

        {/* PEOPLE */}
        <Route path="people" title={t`People`} component={AdminPeopleApp}>
          <IndexRoute component={PeopleListingApp} />
          <Route path="groups" title={t`Groups`}>
            <IndexRoute component={GroupsListingApp} />
            <Route path=":groupId" component={GroupDetailApp} />
          </Route>
        </Route>

        {/* SETTINGS */}
        <Route path="settings" title={t`Settings`}>
          <IndexRedirect to="/admin/settings/setup" />
          {/* <IndexRoute component={SettingsEditorApp} /> */}
          <Route path=":section/:authType" component={SettingsEditorApp} />
          <Route path=":section" component={SettingsEditorApp} />
        </Route>

        {getAdminPermissionsRoutes(store)}
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
  </Route>
);
