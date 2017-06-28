/* eslint "react/prop-types": "warn" */
import React, { Component } from 'react';
import PropTypes from "prop-types";
import { connect } from 'react-redux';

import Sidebar from 'metabase/components/Sidebar.jsx';
import SidebarLayout from 'metabase/components/SidebarLayout.jsx';
import DatabaseDetail from "metabase/reference/databases/DatabaseDetail.jsx"

import * as metadataActions from 'metabase/redux/metadata';
import * as actions from 'metabase/reference/reference';

import {
    getDatabaseId,
    getSectionId,
    getSections,
    getSection,
    getBreadcrumbs,
    getIsEditing
} from '../selectors';


const mapStateToProps = (state, props) => ({
    sectionId: getSectionId(state, props),
    databaseId: getDatabaseId(state, props),
    sections: getSections(state, props),
    section: getSection(state, props),
    breadcrumbs: getBreadcrumbs(state, props),
    isEditing: getIsEditing(state, props)
});

const mapDispatchToProps = {
    ...metadataActions,
    ...actions
};

@connect(mapStateToProps, mapDispatchToProps)
export default class DatabaseDetailContainer extends Component {
    static propTypes = {
        params: PropTypes.object.isRequired,
        breadcrumbs: PropTypes.array,
        location: PropTypes.object.isRequired,
        sections: PropTypes.object.isRequired,
        section: PropTypes.object.isRequired,
        isEditing: PropTypes.bool
    };

    async componentWillMount() {
        await actions.rFetchDatabaseMetadata(this.props, this.props.databaseId);
    }

    async componentWillReceiveProps(newProps) {
        if (this.props.location.pathname === newProps.location.pathname) {
            return;
        }

        newProps.endEditing();
        newProps.endLoading();
        newProps.clearError();
        newProps.collapseFormula();

        await actions.rFetchDatabaseMetadata(newProps, newProps.databaseId);
    }

    render() {
        const {
            sections,
            breadcrumbs,
            isEditing
        } = this.props;


        return (
            <SidebarLayout
                className="flex-full relative"
                style={ isEditing ? { paddingTop: '43px' } : {}}
                sidebar={<Sidebar sections={sections} breadcrumbs={breadcrumbs} />}
            >
                <DatabaseDetail {...this.props} />
            </SidebarLayout>
        );
    }
}
