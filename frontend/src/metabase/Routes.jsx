import React, { Component, PropTypes } from "react";

import { Route } from 'react-router';
import { ReduxRouter } from 'redux-router';

// auth containers
import ForgotPasswordApp from "metabase/auth/containers/ForgotPasswordApp.jsx";
import LoginApp from "metabase/auth/containers/LoginApp.jsx";
import LogoutApp from "metabase/auth/containers/LogoutApp.jsx";
import PasswordResetApp from "metabase/auth/containers/PasswordResetApp.jsx";

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


export default class Routes extends Component {
    // this lets us forward props we've injected from the Angular controller
    _forwardProps(ComposedComponent, propNames) {
        let forwarededProps = {};
        for (const propName of propNames) {
            forwarededProps[propName] = this.props[propName];
        }
        return (props) => <ComposedComponent {...props} {...forwarededProps} />;
    }

    render() {
        return (
            <ReduxRouter>
                <Route path="/" component={this._forwardProps(HomepageApp, ["onChangeLocation"])} />

                <Route path="/admin">
                    <Route path="databases" component={DatabaseListApp} />
                    <Route path="databases/create" component={this._forwardProps(DatabaseEditApp, ["onChangeLocation"])} />
                    <Route path="databases/:databaseId" component={this._forwardProps(DatabaseEditApp, ["onChangeLocation"])} />

                    <Route path="datamodel">
                        <Route path="database" component={this._forwardProps(MetadataEditorApp, ["onChangeLocation"])} />
                        <Route path="database/:databaseId" component={this._forwardProps(MetadataEditorApp, ["onChangeLocation"])} />
                        <Route path="database/:databaseId/:mode" component={this._forwardProps(MetadataEditorApp, ["onChangeLocation"])} />
                        <Route path="database/:databaseId/:mode/:tableId" component={this._forwardProps(MetadataEditorApp, ["onChangeLocation"])} />
                        <Route path="metric/create" component={this._forwardProps(MetricApp, ["onChangeLocation"])} />
                        <Route path="metric/:id" component={this._forwardProps(MetricApp, ["onChangeLocation"])} />
                        <Route path="segment/create" component={this._forwardProps(SegmentApp, ["onChangeLocation"])} />
                        <Route path="segment/:id" component={this._forwardProps(SegmentApp, ["onChangeLocation"])} />
                        <Route path=":entity/:id/revisions" component={RevisionHistoryApp} />
                    </Route>

                    <Route path="people" component={this._forwardProps(AdminPeopleApp, ["onChangeLocation"])} />
                    <Route path="settings" component={this._forwardProps(SettingsEditorApp, ["refreshSiteSettings"])} />
                </Route>

                <Route path="/auth/forgot_password" component={ForgotPasswordApp} />
                <Route path="/auth/login" component={this._forwardProps(LoginApp, ["onChangeLocation"])} />
                <Route path="/auth/logout" component={this._forwardProps(LogoutApp, ["onChangeLocation"])} />
                <Route path="/auth/reset_password/:token" component={this._forwardProps(PasswordResetApp, ["onChangeLocation"])} />

                <Route path="/card/:cardId" component={this._forwardProps(QueryBuilder, ["onChangeLocation", "broadcastEventFn", "updateUrl"])} />

                <Route path="/dash/:dashboardId" component={this._forwardProps(DashboardApp, ["onChangeLocation", "onChangeLocationSearch", "onBroadcast"])} />

                <Route path="/pulse" component={this._forwardProps(PulseListApp, ["onChangeLocation"])} />
                <Route path="/pulse/create" component={this._forwardProps(PulseEditApp, ["onChangeLocation"])} />
                <Route path="/pulse/:pulseId" component={this._forwardProps(PulseEditApp, ["onChangeLocation"])} />

                <Route path="/q" component={this._forwardProps(QueryBuilder, ["onChangeLocation", "broadcastEventFn", "updateUrl"])} />

                <Route path="/questions" component={EntityBrowser}>
                    <Route path="edit/labels" component={EditLabels} />
                    <Route path=":section" component={EntityList} />
                    <Route path=":section/:slug" component={EntityList} />
                </Route>

                <Route path="/setup" component={this._forwardProps(SetupApp, ["setSessionFn"])} />

                <Route path="/user/edit_current" component={UserSettingsApp} />

                <Route path="/unauthorized" component={Unauthorized} />
                <Route path="/*" component={NotFound} />
            </ReduxRouter>
        );
    }
}
