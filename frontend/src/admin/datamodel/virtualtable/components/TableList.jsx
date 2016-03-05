import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

import _ from "underscore";


export default class TableList extends Component {

    static propTypes = {
        tableId: PropTypes.number,
        tables: PropTypes.array.isRequired,
        selectTable: PropTypes.func.isRequired
    };

    onPickTable(table) {
        if (this.props.selectTable) {
            this.props.selectTable(table);
        }
    }

    render() {
        if (!this.props.tables) return;

        const tables = _.sortBy(this.props.tables.filter((t) => !t.visibility_type), "display_name");
        return (
            <ul className="p1 scroll-y scroll-show">
                { tables.map((table, idx) =>
                    <li key={table.id} className="List-item flex">
                        <a
                            className="flex-full flex align-center px1 cursor-pointer"
                            style={{ paddingTop: "0.25rem", paddingBottom: "0.25rem" }}
                            onClick={(e) => this.onPickTable(tables[idx])}
                        >
                            <Icon name="table2" width="18" height="18" />
                            <h4 className="List-item-title ml2">{table.display_name}</h4>
                        </a>
                    </li>
                )}
            </ul>
        );
    }
}
