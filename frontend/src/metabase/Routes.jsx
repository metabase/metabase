import React, { Component, PropTypes } from "react";

import { Route, IndexRoute, IndexRedirect, Redirect } from 'react-router';

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

import Navbar from "metabase/nav/containers/Navbar.jsx";

import { UserAuthWrapper } from 'redux-auth-wrapper';

// START react-router-redux
import { routerActions } from 'react-router-redux';
const redirectAction = routerActions.replace;
// END react-router-redux

// START redux-router
// import { push } from 'redux-router';
// const redirectAction = ({ pathname, query }) => {
//     console.log("REDIRECT", pathname, query);
//     if (query.redirect) {
//         return push(`${pathname}?next=${query.redirect}`)
//     } else {
//         return push(pathname)
//     }
// };
// END redux-router

// Create the wrapper that checks if user is authenticated.
const UserIsAuthenticated = UserAuthWrapper({
  // Select the field of the state with auth data
  authSelector: state => state.currentUser,
  redirectAction: redirectAction,
  // Choose the url to redirect not authenticated users.
  failureRedirectPath: '/auth/login',
  wrapperDisplayName: 'UserIsAuthenticated'
})

// Do the same to create the wrapper that checks if user is NOT authenticated.
const UserIsNotAuthenticated = UserAuthWrapper({
  authSelector: state => state.currentUser,
  redirectAction: redirectAction,
  failureRedirectPath: '/',
  // Choose what exactly you need to check in the selected field of the state
  // (in the previous wrapper it checks by default).
  predicate: currentUser => !currentUser,
  wrapperDisplayName: 'UserIsNotAuthenticated'
})

import { connect } from "react-redux";
import { push } from "react-router-redux";

function FIXME_forwardOnChangeLocation(Component) {
    return connect(null, { onChangeLocation: push })(Component)
}

const NotAuthenticated = UserIsNotAuthenticated(({ children }) => children);
const Authenticated = UserIsAuthenticated(({ children }) => children);

class App extends Component {
    componentWillMount() {
        console.log('will mount app')
    }
    render() {
        const { children, location } = this.props;
        return (
            <div className="spread flex flex-column">
                <Navbar location={location} className="flex-no-shrink" />
                {children}
            </div>
        )
    }
}

const Routes =
    <Route component={App}>
        {/* AUTH */}
        <Route path="/auth">
            <IndexRedirect to="/auth/login" />
            <Route path="forgot_password" component={ForgotPasswordApp} />
            <Route path="login" component={LoginApp} />
            <Route path="logout" component={LogoutApp} />
            <Route path="reset_password/:token" component={PasswordResetApp} />
            <Route path="google_no_mb_account" component={GoogleNoAccount} />
        </Route>

        {/* SETUP */}
        <Route path="/setup" component={SetupApp} />

        {/* MAIN */}
        <Route component={Authenticated}>
            {/* HOME */}
            <Route path="/" component={HomepageApp} />

            {/* DASHBOARD */}
            <Route path="/dash/:dashboardId" component={FIXME_forwardOnChangeLocation(DashboardApp)} />

            {/* QUERY BUILDER */}
            <Route path="/card/:cardId" component={FIXME_forwardOnChangeLocation(QueryBuilder, ["onChangeLocation", "updateUrl"])} />
            <Route path="/q" component={FIXME_forwardOnChangeLocation(QueryBuilder, ["onChangeLocation", "updateUrl"])} />

            {/* QUESTIONS */}
            <Route path="/questions" component={EntityBrowser}>
                <Route path="edit/labels" component={EditLabels} />
                <Route path=":section" component={EntityList} />
                <Route path=":section/:slug" component={EntityList} />
            </Route>

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
            <Route path="/pulse" component={FIXME_forwardOnChangeLocation(PulseListApp)} />
            <Route path="/pulse/create" component={FIXME_forwardOnChangeLocation(PulseEditApp)} />
            <Route path="/pulse/:pulseId" component={FIXME_forwardOnChangeLocation(PulseEditApp)} />

            {/* USER */}
            <Route path="/user/edit_current" component={UserSettingsApp} />
        </Route>

        {/* ADMIN */}
        <Route path="/admin" component={Authenticated}>
            <IndexRedirect to="/admin/settings" />
            <Route path="databases" component={DatabaseListApp} />
            <Route path="databases/create" component={FIXME_forwardOnChangeLocation(DatabaseEditApp)} />
            <Route path="databases/:databaseId" component={FIXME_forwardOnChangeLocation(DatabaseEditApp)} />

            <Route path="datamodel">
                <Route path="database" component={FIXME_forwardOnChangeLocation(MetadataEditorApp)} />
                <Route path="database/:databaseId" component={FIXME_forwardOnChangeLocation(MetadataEditorApp)} />
                <Route path="database/:databaseId/:mode" component={FIXME_forwardOnChangeLocation(MetadataEditorApp)} />
                <Route path="database/:databaseId/:mode/:tableId" component={FIXME_forwardOnChangeLocation(MetadataEditorApp)} />
                <Route path="metric/create" component={FIXME_forwardOnChangeLocation(MetricApp)} />
                <Route path="metric/:id" component={FIXME_forwardOnChangeLocation(MetricApp)} />
                <Route path="segment/create" component={FIXME_forwardOnChangeLocation(SegmentApp)} />
                <Route path="segment/:id" component={FIXME_forwardOnChangeLocation(SegmentApp)} />
                <Route path=":entity/:id/revisions" component={RevisionHistoryApp} />
            </Route>

            <Route path="people" component={FIXME_forwardOnChangeLocation(AdminPeopleApp)} />

            <Route path="settings" component={SettingsEditorApp} />
            <Route path="settings/:section" component={SettingsEditorApp} />
        </Route>

        {/* MISC */}
        <Route path="/unauthorized" component={Unauthorized} />
        <Route path="/*" component={NotFound} />

        {/* LEGACY */}
        <Redirect from="/card" to="/questions" />
        <Redirect from="/card/:cardId/:serializedCard" to="/questions/:cardId#:serializedCard" />
        <Redirect from="/q/:serializedCard" to="/q#:serializedCard" />
    </Route>

export default Routes;
