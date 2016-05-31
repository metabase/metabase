import React, { Component, PropTypes } from "react";

import RevisionHistory from "../components/revisions/RevisionHistory.jsx";

import { revisionHistorySelectors } from "../selectors";
import * as actions from "../actions";

import { connect } from "react-redux";

@connect(revisionHistorySelectors, actions)
export default class RevisionHistoryApp extends Component {
    componentWillMount() {
        let { entity, id } = this.props.params;

        this.props.fetchRevisions({ entity, id })
    }
    render() {
        return (
            <RevisionHistory {...this.props} objectType={this.props.params.entity} />
        );
    }
}
