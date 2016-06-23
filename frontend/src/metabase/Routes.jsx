import React, { Component, PropTypes } from "react";

import { Route } from 'react-router';
import { ReduxRouter } from 'redux-router';

// main app containers
import DashboardApp from "metabase/dashboard/containers/DashboardApp.jsx";
import HomepageApp from "metabase/home/containers/HomepageApp.jsx";
import EntityBrowser from "metabase/questions/containers/EntityBrowser.jsx";
import EntityList from "metabase/questions/containers/EntityList.jsx";
import EditLabels from "metabase/questions/containers/EditLabels.jsx";
import PulseEditApp from "metabase/pulse/containers/PulseEditApp.jsx";
import PulseListApp from "metabase/pulse/containers/PulseListApp.jsx";
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder.jsx";

// admin containers
import MetadataEditorApp from "metabase/admin/datamodel/containers/MetadataEditorApp.jsx";
import MetricApp from "metabase/admin/datamodel/containers/MetricApp.jsx";
import SegmentApp from "metabase/admin/datamodel/containers/SegmentApp.jsx";
import RevisionHistoryApp from "metabase/admin/datamodel/containers/RevisionHistoryApp.jsx";


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
                </Route>

                <Route path="/card/:cardId" component={QueryBuilder} />

                <Route path="/dash/:dashboardId" component={this._forwardProps(DashboardApp, ["onChangeLocation", "onChangeLocationSearch", "onBroadcast"])} />

                <Route path="/pulse" component={this._forwardProps(PulseListApp, ["onChangeLocation"])} />
                <Route path="/pulse/create" component={this._forwardProps(PulseEditApp, ["onChangeLocation"])} />
                <Route path="/pulse/:pulseId" component={this._forwardProps(PulseEditApp, ["onChangeLocation"])} />

                <Route path="/q" component={QueryBuilder} />

                <Route path="/questions" component={EntityBrowser}>
                    <Route path="edit/labels" component={EditLabels} />
                    <Route path=":section" component={EntityList} />
                    <Route path=":section/:slug" component={EntityList} />
                </Route>

                <Route path="/*"/>
            </ReduxRouter>
        );
    }
}
