import React, { Component, PropTypes } from "react";

import { Route, Redirect, IndexRedirect, IndexRoute } from 'react-router';
import { routerActions } from 'react-router-redux';
import { UserAuthWrapper } from 'redux-auth-wrapper';

import { refreshCurrentUser } from "metabase/user";
import MetabaseSettings from "metabase/lib/settings";

import App from "metabase/App.jsx";

// auth containers
import ForgotPasswordApp from "metabase/auth/containers/ForgotPasswordApp.jsx";
import LoginApp from "metabase/auth/containers/LoginApp.jsx";
import LogoutApp from "metabase/auth/containers/LogoutApp.jsx";
import PasswordResetApp from "metabase/auth/containers/PasswordResetApp.jsx";
import GoogleNoAccount from "metabase/auth/components/GoogleNoAccount.jsx";

// main app containers
import DashboardApp from "metabase/dashboard/containers/DashboardApp.jsx";
import HomepageApp from "metabase/home/containers/HomepageApp.jsx";
import EntityBrowser from "metabase/questions/containers/EntityBrowser.jsx";
import Archive from "metabase/questions/containers/Archive.jsx";
import QuestionIndex from "metabase/questions/containers/QuestionIndex.jsx";
import EntityList from "metabase/questions/containers/EntityList.jsx";
import EditLabels from "metabase/questions/containers/EditLabels.jsx";
import PulseEditApp from "metabase/pulse/containers/PulseEditApp.jsx";
import PulseListApp from "metabase/pulse/containers/PulseListApp.jsx";
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder.jsx";
import SetupApp from "metabase/setup/containers/SetupApp.jsx";
import UserSettingsApp from "metabase/user/containers/UserSettingsApp.jsx";

// admin containers
import DatabaseListApp from "metabase/admin/databases/containers/DatabaseListApp.jsx";
import DatabaseEditApp from "metabase/admin/databases/containers/DatabaseEditApp.jsx";
import MetadataEditorApp from "metabase/admin/datamodel/containers/MetadataEditorApp.jsx";
import MetricApp from "metabase/admin/datamodel/containers/MetricApp.jsx";
import SegmentApp from "metabase/admin/datamodel/containers/SegmentApp.jsx";
import RevisionHistoryApp from "metabase/admin/datamodel/containers/RevisionHistoryApp.jsx";
import AdminPeopleApp from "metabase/admin/people/containers/AdminPeopleApp.jsx";
import SettingsEditorApp from "metabase/admin/settings/containers/SettingsEditorApp.jsx";

import NotFound from "metabase/components/NotFound.jsx";
import Unauthorized from "metabase/components/Unauthorized.jsx";

import ReferenceApp from "metabase/reference/containers/ReferenceApp.jsx";
import ReferenceEntity from "metabase/reference/containers/ReferenceEntity.jsx";
import ReferenceEntityList from "metabase/reference/containers/ReferenceEntityList.jsx";
import ReferenceFieldsList from "metabase/reference/containers/ReferenceFieldsList.jsx";
import ReferenceRevisionsList from "metabase/reference/containers/ReferenceRevisionsList.jsx";
import ReferenceGettingStartedGuide from "metabase/reference/containers/ReferenceGettingStartedGuide.jsx";

import getAdminPermissionsRoutes from "metabase/admin/permissions/routes.jsx";

import PeopleListingApp from "metabase/admin/people/containers/PeopleListingApp.jsx";
import GroupsListingApp from "metabase/admin/people/containers/GroupsListingApp.jsx";
import GroupDetailApp from "metabase/admin/people/containers/GroupDetailApp.jsx";

const MetabaseIsSetup = UserAuthWrapper({
    predicate: authData => !authData.hasSetupToken,
    failureRedirectPath: "/setup",
    authSelector: state => ({ hasSetupToken: MetabaseSettings.hasSetupToken() }), // HACK
    wrapperDisplayName: 'MetabaseIsSetup',
    allowRedirectBack: false,
    redirectAction: routerActions.replace,
});

const UserIsAuthenticated = UserAuthWrapper({
    failureRedirectPath: '/auth/login',
    authSelector: state => state.currentUser,
    wrapperDisplayName: 'UserIsAuthenticated',
    redirectAction: routerActions.replace,
});

const UserIsAdmin = UserAuthWrapper({
    predicate: currentUser => currentUser && currentUser.is_superuser,
    failureRedirectPath: '/unauthorized',
    authSelector: state => state.currentUser,
    allowRedirectBack: false,
    wrapperDisplayName: 'UserIsAdmin',
    redirectAction: routerActions.replace,
});

const UserIsNotAuthenticated = UserAuthWrapper({
    predicate: currentUser => !currentUser,
    failureRedirectPath: '/',
    authSelector: state => state.currentUser,
    allowRedirectBack: false,
    wrapperDisplayName: 'UserIsNotAuthenticated',
    redirectAction: routerActions.replace,
});

const IsAuthenticated = MetabaseIsSetup(UserIsAuthenticated(({ children }) => children));
const IsAdmin = MetabaseIsSetup(UserIsAuthenticated(UserIsAdmin(({ children }) => children)));
const IsNotAuthenticated = MetabaseIsSetup(UserIsNotAuthenticated(({ children }) => children));

export const getRoutes = (store) =>
    <Route component={App}>
        {/* SETUP */}
        <Route path="/setup" component={SetupApp} onEnter={(nextState, replace) => {
            if (!MetabaseSettings.hasSetupToken()) {
                replace("/");
            }
        }} />

        {/* APP */}
        <Route onEnter={async (nextState, replace, done) => {
            await store.dispatch(refreshCurrentUser());
            done();
        }}>
            {/* AUTH */}
            <Route path="/auth">
                <IndexRedirect to="/auth/login" />
                <Route component={IsNotAuthenticated}>
                    <Route path="login" component={LoginApp} />
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

                {/* DASHBOARD */}
                <Route path="/dash/:dashboardId" component={DashboardApp} />

                {/* QUERY BUILDER */}
                <Route path="/card/:cardId" component={QueryBuilder} />
                <Route path="/q" component={QueryBuilder} />

                {/* QUESTIONS */}
                <Route path="/questions" component={QuestionIndex} />
                <Route path="/questions/archive" component={Archive} />
                <Route path="/questions/permissions" component={QuestionPermissions} />
                <Route path="/questions/collection/:collectionName" component={CollectionPage} />

                {/* REFERENCE */}
                <Route path="/reference" component={ReferenceApp}>
                    <IndexRedirect to="/reference/guide" />
                    <Route path="guide" component={ReferenceGettingStartedGuide} />
                    <Route path="metrics" component={ReferenceEntityList} />
                    <Route path="metrics/:metricId" component={ReferenceEntity} />
                    <Route path="metrics/:metricId/questions" component={ReferenceEntityList} />
                    <Route path="metrics/:metricId/revisions" component={ReferenceRevisionsList} />
                    <Route path="segments" component={ReferenceEntityList} />
                    <Route path="segments/:segmentId" component={ReferenceEntity} />
                    <Route path="segments/:segmentId/fields" component={ReferenceFieldsList} />
                    <Route path="segments/:segmentId/fields/:fieldId" component={ReferenceEntity} />
                    <Route path="segments/:segmentId/questions" component={ReferenceEntityList} />
                    <Route path="segments/:segmentId/revisions" component={ReferenceRevisionsList} />
                    <Route path="databases" component={ReferenceEntityList} />
                    <Route path="databases/:databaseId" component={ReferenceEntity} />
                    <Route path="databases/:databaseId/tables" component={ReferenceEntityList} />
                    <Route path="databases/:databaseId/tables/:tableId" component={ReferenceEntity} />
                    <Route path="databases/:databaseId/tables/:tableId/fields" component={ReferenceFieldsList} />
                    <Route path="databases/:databaseId/tables/:tableId/fields/:fieldId" component={ReferenceEntity} />
                    <Route path="databases/:databaseId/tables/:tableId/questions" component={ReferenceEntityList} />
                </Route>

                {/* PULSE */}
                <Route path="/pulse" component={PulseListApp} />
                <Route path="/pulse/create" component={PulseEditApp} />
                <Route path="/pulse/:pulseId" component={PulseEditApp} />

                {/* USER */}
                <Route path="/user/edit_current" component={UserSettingsApp} />
            </Route>

            {/* ADMIN */}
            <Route path="/admin" component={IsAdmin}>
                <IndexRedirect to="/admin/settings" />

                <Route path="databases" component={DatabaseListApp} />
                <Route path="databases/create" component={DatabaseEditApp} />
                <Route path="databases/:databaseId" component={DatabaseEditApp} />

                <Route path="datamodel">
                    <IndexRedirect to="database" />
                    <Route path="database" component={MetadataEditorApp} />
                    <Route path="database/:databaseId" component={MetadataEditorApp} />
                    <Route path="database/:databaseId/:mode" component={MetadataEditorApp} />
                    <Route path="database/:databaseId/:mode/:tableId" component={MetadataEditorApp} />
                    <Route path="metric/create" component={MetricApp} />
                    <Route path="metric/:id" component={MetricApp} />
                    <Route path="segment/create" component={SegmentApp} />
                    <Route path="segment/:id" component={SegmentApp} />
                    <Route path=":entity/:id/revisions" component={RevisionHistoryApp} />
                </Route>

                {/* PEOPLE */}
                <Route path="people" component={AdminPeopleApp}>
                    <IndexRoute component={PeopleListingApp} />
                    <Route path="groups">
                        <IndexRoute component={GroupsListingApp} />
                        <Route path=":groupId" component={GroupDetailApp} />
                    </Route>
                </Route>

                <Route path="settings" component={SettingsEditorApp} />
                <Route path="settings/:section" component={SettingsEditorApp} />

                {getAdminPermissionsRoutes(store)}
            </Route>

            {/* MISC */}
            <Route path="/unauthorized" component={Unauthorized} />
            <Route path="/*" component={NotFound} />

            {/* LEGACY */}
            <Redirect from="/card" to="/questions" />
            <Redirect from="/card/:cardId/:serializedCard" to="/questions/:cardId#:serializedCard" />
            <Redirect from="/q/:serializedCard" to="/q#:serializedCard" />
        </Route>
    </Route>



const CollectionPage = ({ params }) =>
    <div>
        { name }
    </div>

const QuestionPermissions = () =>
    <div>
        Question permissions
    </div>

