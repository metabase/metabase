/* eslint "react/prop-types": "warn" */
import React, { Component } from 'react';
import PropTypes from "prop-types";
import { connect } from 'react-redux';

import SegmentSidebar from './SegmentSidebar.jsx';
import SidebarLayout from 'metabase/components/SidebarLayout.jsx';
import SegmentDetail from "metabase/reference/segments/SegmentDetail.jsx"

import * as metadataActions from 'metabase/redux/metadata';
import * as actions from 'metabase/reference/reference';

import {
    getUser,
    getSegment,
    getSegmentId,
    getDatabaseId,
    getSectionId,
    getSection,
    getIsEditing
} from '../selectors';

const mapStateToProps = (state, props) => ({
    user: getUser(state, props),
    segment: getSegment(state, props),
    segmentId: getSegmentId(state, props),
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
export default class SegmentDetailContainer extends Component {
    static propTypes = {
        params: PropTypes.object.isRequired,
        location: PropTypes.object.isRequired,
        user: PropTypes.object.isRequired,
        segment: PropTypes.object.isRequired,
        section: PropTypes.object.isRequired,
        isEditing: PropTypes.bool
    };

    async fetchContainerData(){
        await actions.rFetchSegmentDetail(this.props, this.props.segmentId);
    }

    async componentWillMount() {
        this.fetchContainerData()
    }


    async componentWillReceiveProps(newProps) {
        if (this.props.location.pathname === newProps.location.pathname) {
            return;
        }

        newProps.endEditing();
        newProps.endLoading();
        newProps.clearError();
        newProps.collapseFormula();
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
                <SegmentDetail {...this.props} />
            </SidebarLayout>
        );
    }
}
