import React, { Component, PropTypes } from "react";

import ProgressBar from "metabase/components/ProgressBar.jsx";
import Icon from "metabase/components/Icon.jsx";

import _ from "underscore";
import cx from 'classnames';
import Humanize from 'humanize';

export default class MetadataTableList extends Component {
    constructor(props, context) {
        super(props, context);
        this.updateSearchText = this.updateSearchText.bind(this);

        this.state = {
            searchText: null,
            searchRegex: null
        };
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
                var classes = cx("AdminList-item", "flex", "align-center", "no-decoration", {
                    "selected": this.props.tableId === table.id
                });
                var row = (
                    <li key={table.id}>
                        <a href="#" className={classes} onClick={this.props.selectTable.bind(null, table)}>
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
            queryableTablesHeader = <li className="AdminList-section">{queryableTables.length} Queryable {Humanize.pluralize(queryableTables.length, "Table")}</li>;
        }
        if (hiddenTables.length > 0) {
            hiddenTablesHeader = <li className="AdminList-section">{hiddenTables.length} Hidden {Humanize.pluralize(hiddenTables.length, "Table")}</li>;
        }
        if (queryableTables.length === 0 && hiddenTables.length === 0) {
            queryableTablesHeader = <li className="AdminList-section">0 Tables</li>;
        }

        return (
            <div className="MetadataEditor-table-list AdminList">
                <div className="AdminList-search">
                    <Icon name="search" width="16" height="16"/>
                    <input
                        className="AdminInput pl4 border-bottom"
                        type="text"
                        placeholder="Find a table"
                        value={this.state.searchText}
                        onChange={this.updateSearchText}
                    />
                </div>
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
