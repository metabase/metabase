import React, { Component, PropTypes } from "react";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import MetadataTableList from "metabase/admin/datamodel/components/database/MetadataTableList.jsx";

import TableList from "./TableList.jsx";


export default class PickBaseTableSidePanel extends Component {

    async onStart() {
        this.props.startNewTable();

        try {
            await this.props.fetchTables(this.props.databaseId);
        } catch (error) {
            this.setState({ error });
        }
    }

    render() {
        const { tables, virtualTable } = this.props;

        // virtualTable is NULL when starting fresh
        if (!virtualTable) {
            return (
                <div className="text-centered" style={{paddingTop: "3rem", paddingBottom: "3rem"}}>
                    <a className="Button Button--primary" onClick={() => this.onStart()}>Choose a table to start with</a>
                </div>
            );

        // otherwise we expect virtualTable to exist, but not base table has been chosen (yet!)
        } else if (tables) {
            return (
                <div style={{height: "100%"}} className="p1 scroll-y scroll-show">
                   <TableList tables={tables} selectTable={(table) => this.props.pickBaseTable(table)} />
                </div>
            );

        // loading or error state
        } else {
            return null;
        }
    }
}
