/* eslint "react/prop-types": "warn" */
import React, { Component } from 'react';
import PropTypes from "prop-types";
import { connect } from 'react-redux';

import MetricSidebar from './MetricSidebar.jsx';
import SidebarLayout from 'metabase/components/SidebarLayout.jsx';
import MetricRevisions from "metabase/reference/metrics/MetricRevisions.jsx"

import * as metadataActions from 'metabase/redux/metadata';
import * as actions from 'metabase/reference/reference';

import {
    getUser,
    getMetric,
    getDatabaseId,
    getSectionId,
    getSection,
    getIsEditing
} from '../selectors';

import {
    tryFetchData
} from '../utils';


const mapStateToProps = (state, props) => ({
    user: getUser(state, props),
    metric: getMetric(state, props),
    sectionId: getSectionId(state, props),
    databaseId: getDatabaseId(state, props),
    section: getSection(state, props),
    isEditing: getIsEditing(state, props)
});

const mapDispatchToProps = {
    ...metadataActions,
    ...actions
};

@connect(mapStateToProps, mapDispatchToProps)
export default class MetricRevisionsContainer extends Component {
    static propTypes = {
        params: PropTypes.object.isRequired,
        location: PropTypes.object.isRequired,
        user: PropTypes.object.isRequired,
        metric: PropTypes.object.isRequired,
        section: PropTypes.object.isRequired,
        isEditing: PropTypes.bool
    };

    async componentWillMount() {
        await tryFetchData(this.props);
    }

    async componentWillReceiveProps(newProps) {
        if (this.props.location.pathname === newProps.location.pathname) {
            return;
        }

        newProps.endEditing();
        newProps.endLoading();
        newProps.clearError();
        newProps.collapseFormula();

        await tryFetchData(newProps);
    }

    render() {
        const {
            user,
            metric,
            isEditing
        } = this.props;


        return (
            <SidebarLayout
                className="flex-full relative"
                style={ isEditing ? { paddingTop: '43px' } : {}}
                sidebar={<MetricSidebar metric={metric} user={user}/>}
            >
                <MetricRevisions {...this.props} />
            </SidebarLayout>
        );
    }
}
