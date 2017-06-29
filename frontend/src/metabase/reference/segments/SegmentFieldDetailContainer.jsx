/* eslint "react/prop-types": "warn" */
import React, { Component } from 'react';
import PropTypes from "prop-types";
import { connect } from 'react-redux';

import SegmentFieldSidebar from './SegmentFieldSidebar.jsx';
import SidebarLayout from 'metabase/components/SidebarLayout.jsx';
import SegmentFieldDetail from "metabase/reference/segments/SegmentFieldDetail.jsx"

import * as metadataActions from 'metabase/redux/metadata';
import * as actions from 'metabase/reference/reference';

import {
    getSegment,
    getField,
    getDatabaseId,
    getSectionId,
    getSection,
    getIsEditing
} from '../selectors';

import {
    tryFetchData
} from '../utils';


const mapStateToProps = (state, props) => ({
    sectionId: getSectionId(state, props),
    segment: getSegment(state, props),    
    field: getField(state, props),    
    databaseId: getDatabaseId(state, props),
    section: getSection(state, props),
    isEditing: getIsEditing(state, props)
});

const mapDispatchToProps = {
    ...metadataActions,
    ...actions
};

@connect(mapStateToProps, mapDispatchToProps)
export default class SegmentFieldDetailContainer extends Component {
    static propTypes = {
        params: PropTypes.object.isRequired,
        location: PropTypes.object.isRequired,
        segment: PropTypes.object.isRequired,
        field: PropTypes.object.isRequired,
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
            segment,
            field,
            isEditing
        } = this.props;

        return (
            <SidebarLayout
                className="flex-full relative"
                style={ isEditing ? { paddingTop: '43px' } : {}}
                sidebar={<SegmentFieldSidebar segment={segment} field={field}/>}
            >
                <SegmentFieldDetail {...this.props} />
            </SidebarLayout>
        );
    }
}
