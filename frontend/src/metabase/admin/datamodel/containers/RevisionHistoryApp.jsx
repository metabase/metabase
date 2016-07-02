import React, { Component, PropTypes } from "react";

import RevisionHistory from "../components/revisions/RevisionHistory.jsx";

import { revisionHistorySelectors } from "../selectors";
import * as actions from "../metadata";

import { connect } from "react-redux";

const mapStateToProps = (state, props) => {
    return {
        ...revisionHistorySelectors(state),
        entity: state.router && state.router.params && state.router.params.entity,
        id:     state.router && state.router.params && state.router.params.id
    }
}

@connect(mapStateToProps, actions)
export default class RevisionHistoryApp extends Component {
    componentWillMount() {
        let { entity, id } = this.props;

        this.props.fetchRevisions({ entity, id })
    }
    render() {
        return (
            <RevisionHistory {...this.props} objectType={this.props.entity} />
        );
    }
}
