/* eslint "react/prop-types": "warn" */
import React, { Component } from 'react';
import PropTypes from "prop-types";
import { connect } from 'react-redux';

import ReferenceGettingStartedGuide from "metabase/reference/guide/ReferenceGettingStartedGuide.jsx"

import * as metadataActions from 'metabase/redux/metadata';
import * as actions from 'metabase/reference/reference';

import {
    getDatabaseId,
    getIsEditing
} from '../selectors';


import {
    fetchDashboards
} from 'metabase/dashboards/dashboards';

const mapStateToProps = (state, props) => ({
    databaseId: getDatabaseId(state, props),
    isEditing: getIsEditing(state, props)
});

const mapDispatchToProps = {
    fetchDashboards,
    ...metadataActions,
    ...actions
};

@connect(mapStateToProps, mapDispatchToProps)
export default class GettingStartedGuideContainer extends Component {
    static propTypes = {
        params: PropTypes.object.isRequired,
        location: PropTypes.object.isRequired,
        databaseId: PropTypes.number.isRequired,
        isEditing: PropTypes.bool
    };

    async fetchContainerData() {
        await actions.wrappedFetchGuide(this.props);
    }

    componentWillMount() {
        this.fetchContainerData()
    }

    componentWillReceiveProps(newProps) {
        if (this.props.location.pathname === newProps.location.pathname) {
            return;
        }

        actions.clearState(newProps)
    }

    render() {

        return (
                <ReferenceGettingStartedGuide {...this.props} />
        );
    }
}
