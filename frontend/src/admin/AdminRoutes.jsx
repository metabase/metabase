import React, { Component, PropTypes } from "react";

import { Route } from 'react-router';
import { ReduxRouter } from 'redux-router';

import SegmentApp from "./datamodel/containers/SegmentApp.jsx";
import RevisionHistoryApp from "./datamodel/containers/RevisionHistoryApp.jsx";

export default class AdminRoutes extends Component {
    render() {
        console.log(this.props)
        return (
            <ReduxRouter>
                <Route path="/admin">
                    <Route path="datamodel">
                        <Route path="segment/create" component={SegmentApp} />
                        <Route path="segment/:id" component={SegmentApp} />

                        <Route path=":entity/:id/revisions" component={RevisionHistoryApp} />
                    </Route>
                </Route>
                <Route path="/*"/>
            </ReduxRouter>
        );
    }
}
