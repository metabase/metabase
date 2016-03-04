import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

import _ from "underscore";


export default class FieldListByTable extends Component {

    static propTypes = {
        sections: PropTypes.array.isRequired
    };

    onPickTable(table) {
        if (this.props.selectTable) {
            this.props.selectTable(table);
        }
    }

    // base table
    // joined tables
    // custom fields

    render() {
        if (!this.props.tables) return;

        const tables = _.sortBy(this.props.tables.filter((t) => !t.visibility_type), "display_name");
        return (
            <ul style={{maxHeight: 400}} className="p1 scroll-y scroll-show">
                { tables.map((table, idx) =>
                    <li key={table.id} className="List-item flex">
                        <a
                            className="flex-full flex align-center px1 cursor-pointer"
                            style={{ paddingTop: "0.25rem", paddingBottom: "0.25rem" }}
                            onClick={(e) => this.onPickTable(tables[idx])}
                        >
                            <Icon name="table2" width="18" height="18" />
                            <h4 className="List-item-title ml2">{table.name}</h4>
                        </a>
                    </li>
                )}
            </ul>
        );
    }
}
