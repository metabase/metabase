import React, { Component } from "react";
import PropTypes from "prop-types";

import ProgressBar from "metabase/components/ProgressBar.jsx";
import Icon from "metabase/components/Icon.jsx";

import { inflect } from "metabase/lib/formatting";

import _ from "underscore";
import cx from "classnames";

export default class MetadataTableList extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            searchText: "",
            searchRegex: null
        };

        _.bindAll(this, "updateSearchText");
    }

    static propTypes = {
        tableId: PropTypes.number,
        tables: PropTypes.array.isRequired,
        selectTable: PropTypes.func.isRequired
    };

    updateSearchText(event) {
        this.setState({
            searchText: event.target.value,
            searchRegex: event.target.value ? new RegExp(RegExp.escape(event.target.value), "i") : null
        });
    }

    render() {
        var queryableTablesHeader, hiddenTablesHeader;
        var queryableTables = [];
        var hiddenTables = [];

        if (this.props.tables) {
            var tables = _.sortBy(this.props.tables, "display_name");
            _.each(tables, (table) => {
                var row = (
                    <li key={table.id}>
                        <a className={cx("AdminList-item flex align-center no-decoration", { selected: this.props.tableId === table.id })} onClick={this.props.selectTable.bind(null, table)}>
                            {table.display_name}
                            <ProgressBar className="ProgressBar ProgressBar--mini flex-align-right" percentage={table.metadataStrength} />
                        </a>
                    </li>
                );
                var regex = this.state.searchRegex;
                if (!regex || regex.test(table.display_name) || regex.test(table.name)) {
                    if (table.visibility_type) {
                        hiddenTables.push(row);
                    } else {
                        queryableTables.push(row);
                    }
                }
            });
        }

        if (queryableTables.length > 0) {
            queryableTablesHeader = <li className="AdminList-section">{queryableTables.length} Queryable {inflect("Table", queryableTables.length)}</li>;
        }
        if (hiddenTables.length > 0) {
            hiddenTablesHeader = <li className="AdminList-section">{hiddenTables.length} Hidden {inflect("Table", hiddenTables.length)}</li>;
        }
        if (queryableTables.length === 0 && hiddenTables.length === 0) {
            queryableTablesHeader = <li className="AdminList-section">0 Tables</li>;
        }

        return (
            <div className="MetadataEditor-table-list AdminList flex-no-shrink">
                <div className="AdminList-search">
                    <Icon name="search" size={16}/>
                    <input
                        className="AdminInput pl4 border-bottom"
                        type="text"
                        placeholder="Find a table"
                        value={this.state.searchText}
                        onChange={this.updateSearchText}
                    />
                </div>
                { (this.props.onBack || this.props.schema) &&
                    <h4 className="p2 border-bottom">
                        { this.props.onBack &&
                            <span className="text-brand cursor-pointer" onClick={this.props.onBack}><Icon name="chevronleft" size={10}/> Schemas</span>
                        }
                        { this.props.onBack && this.props.schema && <span className="mx1">-</span>}
                        { this.props.schema && <span> {this.props.schema.name}</span>}
                    </h4>
                }

                <ul className="AdminList-items">
                    {queryableTablesHeader}
                    {queryableTables}
                    {hiddenTablesHeader}
                    {hiddenTables}
                </ul>
            </div>
        );
    }
}
