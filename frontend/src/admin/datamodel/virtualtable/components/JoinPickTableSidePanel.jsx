import React, { Component, PropTypes } from "react";
import _ from "underscore";
import cx from "classnames";

import ButtonGroup from "metabase/components/ButtonGroup.jsx";
import Icon from "metabase/components/Icon.jsx";

import TableList from "./TableList.jsx";


export default class JoinPickTableSidePanel extends Component {

    static propTypes = {
        metadata: PropTypes.object.isRequired,
        virtualTable: PropTypes.object.isRequired
    };

    onPickTable(table) {
        console.log("picked join table", table);

    }

    render() {
        const { metadata, virtualTable } = this.props;

        // don't let the user join back to the base table of this virtual table
        // TODO: should we also prevent joining against the same table twice?
        const tables = metadata.tables.filter((table) => table.id !== virtualTable.table_id);
        return (
            <div style={{height: "100%"}} className="flex flex-column">
                <div className="AdminList-search p2 border-bottom">
                    Pick the table with the fields you want
                </div>

                <div style={{flexGrow: "1"}} className="scroll-y">
                    <TableList tables={tables} selectTable={(table) => this.props.uiPickJoinTable(table)} />
                </div>

                <div className="p1 border-top">
                    <a className="Button Button--primary full text-centered" onClick={() => this.props.setShowAddFieldPicker(null)}>Cancel</a>
                </div>
            </div>
        );
    }
}
