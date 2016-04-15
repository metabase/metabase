import React, { Component, PropTypes } from "react";

import TableList from "./TableList.jsx";


export default class JoinPickTableSidePanel extends Component {

    static propTypes = {
        tables: PropTypes.array.isRequired,
        virtualTable: PropTypes.object.isRequired
    };

    render() {
        const { tables, virtualTable } = this.props;

        // don't let the user join back to the base table of this virtual table
        // TODO: should we also prevent joining against the same table twice?
        const joinableTables = tables.filter((table) => table.id !== virtualTable.table_id);
        return (
            <div style={{height: "100%"}} className="flex flex-column">
                <div className="AdminList-search p2 border-bottom">
                    Pick the table with the fields you want
                </div>

                <div style={{flexGrow: "1"}} className="scroll-y">
                    <TableList tables={joinableTables} selectTable={(table) => this.props.uiPickJoinTable(table)} />
                </div>

                <div className="p1 border-top">
                    <a className="Button Button--primary full text-centered" onClick={() => this.props.uiCancelEditing()}>Cancel</a>
                </div>
            </div>
        );
    }
}
