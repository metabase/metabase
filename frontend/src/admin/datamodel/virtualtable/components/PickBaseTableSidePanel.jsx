import React, { Component, PropTypes } from "react";

import TableList from "./TableList.jsx";


export default class PickBaseTableSidePanel extends Component {

    async onStart() {
        this.props.startNewTable();

        try {
            await this.props.fetchTables(this.props.database.id, this.props.schema);
        } catch (error) {
            this.setState({ error });
        }
    }

    render() {
        const { database, tables, virtualTable } = this.props;

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
                <div style={{height: "100%"}} className="flex flex-column">
                    <div className="AdminList-search p2 border-bottom">
                        <h3>{database.name}</h3>
                    </div>

                    <div className="p1 scroll-y scroll-show">
                        <TableList tables={tables} selectTable={(table) => this.props.pickBaseTable(table)} />
                    </div>
                </div>
            );

        // loading or error state
        } else {
            return null;
        }
    }
}
