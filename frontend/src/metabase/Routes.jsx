import React, { Component, PropTypes } from "react";

import { Route } from 'react-router';
import { ReduxRouter } from 'redux-router';

import DashboardApp from "metabase/dashboard/containers/DashboardApp.jsx";

import MetricApp from "metabase/admin/datamodel/containers/MetricApp.jsx";
import SegmentApp from "metabase/admin/datamodel/containers/SegmentApp.jsx";
import RevisionHistoryApp from "metabase/admin/datamodel/containers/RevisionHistoryApp.jsx";

import EntityBrowser from "metabase/questions/containers/EntityBrowser.jsx";
import EntityList from "metabase/questions/containers/EntityList.jsx";
import EditLabels from "metabase/questions/containers/EditLabels.jsx";

import ReferenceApp from "metabase/reference/containers/ReferenceApp.jsx";
import ReferenceEntityList from "metabase/reference/containers/ReferenceEntityList.jsx";
import ReferenceGettingStartedGuide from "metabase/reference/containers/ReferenceGettingStartedGuide.jsx";

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
                <Route path="/dash/:dashboardId" component={this._forwardProps(DashboardApp, ["onChangeLocation", "onChangeLocationSearch", "onBroadcast"])} />
                <Route path="/admin">
                    <Route path="datamodel">
                        <Route path="metric/create" component={this._forwardProps(MetricApp, ["onChangeLocation"])} />
                        <Route path="metric/:id" component={this._forwardProps(MetricApp, ["onChangeLocation"])} />

                        <Route path="segment/create" component={this._forwardProps(SegmentApp, ["onChangeLocation"])} />
                        <Route path="segment/:id" component={this._forwardProps(SegmentApp, ["onChangeLocation"])} />

                        <Route path=":entity/:id/revisions" component={RevisionHistoryApp} />
                    </Route>
                </Route>

                <Route path="/reference" component={ReferenceApp}>
                    //FIXME: this route triggers ReferenceEntityList when app starts at any path under /reference than /reference/guide
                    <Route path="guide" component={ReferenceGettingStartedGuide} />
                    <Route path=":section" component={ReferenceEntityList} />
                </Route>

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
