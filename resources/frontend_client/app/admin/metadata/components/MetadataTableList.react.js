'use strict';

import ProgressBar from './ProgressBar.react';

import cx from 'classnames';
import Humanize from 'humanize';

export default React.createClass({
    displayName: "MetadataTableList",
    propTypes: {
        tableId: React.PropTypes.number,
        tables: React.PropTypes.object.isRequired,
        selectTable: React.PropTypes.func.isRequired
    },

    getInitialState: function() {
        return {
            searchText: null,
            searchRegex: null
        };
    },

    updateSearchText: function(event) {
        this.setState({
            searchText: event.target.value,
            searchRegex: event.target.value ? new RegExp(RegExp.escape(event.target.value), "i") : null
        });
    },

    render: function() {
        var queryableTablesHeader, hiddenTablesHeader;
        var queryableTables = [];
        var hiddenTables = [];

        if (this.props.tables) {
            _.each(this.props.tables, (table) => {
                var classes = cx("AdminList-item", {
                    "selected": this.props.tableId === table.id,
                    "flex": true,
                    "align-center": true
                });
                var row = (
                    <li key={table.id} className={classes} onClick={this.props.selectTable.bind(null, table)}>
                        {table.display_name}
                        <ProgressBar className="ProgressBar ProgressBar--mini flex-align-right" percentage={table.metadataStrength} />
                    </li>
                )
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
                <input
                    className="AdminList-search AdminInput"
                    type="text"
                    placeholder="Find a table"
                    value={this.state.searchText}
                    onChange={this.updateSearchText}
                />
                <ul className="AdminList-items">
                    {queryableTablesHeader}
                    {queryableTables}
                    {hiddenTablesHeader}
                    {hiddenTables}
                </ul>
            </div>
        );
    }
});
