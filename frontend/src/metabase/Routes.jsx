import React, { Component, PropTypes } from "react";

import { Route } from 'react-router';
import { ReduxRouter } from 'redux-router';

import MetricApp from "metabase/admin/datamodel/containers/MetricApp.jsx";
import SegmentApp from "metabase/admin/datamodel/containers/SegmentApp.jsx";
import RevisionHistoryApp from "metabase/admin/datamodel/containers/RevisionHistoryApp.jsx";

import EntityBrowser from "metabase/questions/containers/EntityBrowser.jsx";
import EntityList from "metabase/questions/containers/EntityList.jsx";
import EditLabels from "metabase/questions/containers/EditLabels.jsx";

import ReferenceApp from "metabase/reference/ReferenceApp.jsx";
import ReferenceEntityList from "metabase/reference/containers/ReferenceEntityList.jsx";
import ReferenceEntity from "metabase/reference/containers/ReferenceEntity.jsx";
import ReferenceEntityEditor from "metabase/reference/containers/ReferenceEntityEditor.jsx";

export default class Routes extends Component {
    render() {
        return (
            <ReduxRouter>
                <Route path="/admin">
                    <Route path="datamodel">
                        <Route path="metric/create" component={MetricApp} />
                        <Route path="metric/:id" component={MetricApp} />

                        <Route path="segment/create" component={SegmentApp} />
                        <Route path="segment/:id" component={SegmentApp} />

                        <Route path=":entity/:id/revisions" component={RevisionHistoryApp} />
                    </Route>
                </Route>

                <Route path="/reference" component={ReferenceApp}>
                      <Route path=":entity" component={ReferenceEntityList} />
                      <Route path=":entity/:id" component={ReferenceEntity} />
                      <Route path=":entity/:id/edit" component={ReferenceEntityEditor} />
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
