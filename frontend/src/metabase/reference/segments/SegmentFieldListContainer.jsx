/* eslint "react/prop-types": "warn" */
import React, { Component } from 'react';
import PropTypes from "prop-types";
import { connect } from 'react-redux';

import SegmentSidebar from './SegmentSidebar.jsx';
import SidebarLayout from 'metabase/components/SidebarLayout.jsx';
import SegmentFieldList from "metabase/reference/segments/SegmentFieldList.jsx"

import * as metadataActions from 'metabase/redux/metadata';
import * as actions from 'metabase/reference/reference';

import {
    getUser,
    getSegment,
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
    segment: getSegment(state, props),
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
export default class SegmentFieldListContainer extends Component {
    static propTypes = {
        params: PropTypes.object.isRequired,
        location: PropTypes.object.isRequired,
        user: PropTypes.object.isRequired,
        segment: PropTypes.object.isRequired,
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
            segment,
            isEditing
        } = this.props;

        return (
            <SidebarLayout
                className="flex-full relative"
                style={ isEditing ? { paddingTop: '43px' } : {}}
                sidebar={<SegmentSidebar segment={segment} user={user}/>}
            >
                <SegmentFieldList {...this.props} />
            </SidebarLayout>
        );
    }
}
