/* eslint "react/prop-types": "warn" */
import React, { Component } from 'react';
import PropTypes from "prop-types";
import { connect } from 'react-redux';

import TableSidebar from './TableSidebar.jsx';
import SidebarLayout from 'metabase/components/SidebarLayout.jsx';
import TableDetail from "metabase/reference/databases/TableDetail.jsx"

import * as metadataActions from 'metabase/redux/metadata';
import * as actions from 'metabase/reference/reference';

import {
    getDatabase,
    getTable,
    getDatabaseId,
    getSectionId,
    getSection,
    getIsEditing
} from '../selectors';


const mapStateToProps = (state, props) => ({
    sectionId: getSectionId(state, props),
    database: getDatabase(state, props),    
    table: getTable(state, props),    
    databaseId: getDatabaseId(state, props),
    section: getSection(state, props),
    isEditing: getIsEditing(state, props)
});

const mapDispatchToProps = {
    ...metadataActions,
    ...actions
};

@connect(mapStateToProps, mapDispatchToProps)
export default class TableDetailContainer extends Component {
    static propTypes = {
        params: PropTypes.object.isRequired,
        location: PropTypes.object.isRequired,
        database: PropTypes.object.isRequired,
        table: PropTypes.object.isRequired,
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
            database,
            table,
            isEditing
        } = this.props;

        return (
            <SidebarLayout
                className="flex-full relative"
                style={ isEditing ? { paddingTop: '43px' } : {}}
                sidebar={<TableSidebar database={database} table={table}/>}
            >
                <TableDetail {...this.props} />
            </SidebarLayout>
        );
    }
}
