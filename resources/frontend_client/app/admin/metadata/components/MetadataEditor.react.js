'use strict';
/*global _*/

import MetadataHeader from './MetadataHeader.react';
import MetadataTableList from './MetadataTableList.react';
import MetadataTable from './MetadataTable.react';
import MetadataSchema from './MetadataSchema.react';

export default React.createClass({
    displayName: "MetadataEditor",
    propTypes: {
        databaseId: React.PropTypes.number,
        databases: React.PropTypes.array.isRequired,
        selectDatabase: React.PropTypes.func.isRequired,
        tableId: React.PropTypes.number,
        tables: React.PropTypes.array.isRequired,
        selectTable: React.PropTypes.func.isRequired,
        updateTable: React.PropTypes.func.isRequired,
        updateField: React.PropTypes.func.isRequired
    },

    getInitialState: function() {
        return {
            saving: false,
            error: null,
            isShowingSchema: false
        }
    },

    toggleShowSchema: function() {
        this.setState({ isShowingSchema: !this.state.isShowingSchema });
    },

    updateTable: function(table) {
        this.setState({ saving: true });
        this.props.updateTable(table).then(() => {
            this.setState({ saving: false });
        }, (error) => {
            this.setState({ saving: false, error: error });
        });
    },

    updateField: function(field) {
        this.setState({ saving: true });
        this.props.updateField(field).then(() => {
            this.setState({ saving: false });
        }, (error) => {
            this.setState({ saving: false, error: error });
        });
    },

    render: function() {
        var table = _.find(this.props.tables, (t) => t.id === this.props.tableId);
        var content;
        if (this.state.isShowingSchema) {
            content = (
                <MetadataSchema
                    table={table}
                    metadata={table && this.props.tablesMetadata[table.id]}
                    updateTable={this.updateTable}
                    updateField={this.updateField}
                />
            );
        } else {
            content = (
                <MetadataTable
                    table={table}
                    metadata={table && this.props.tablesMetadata[table.id]}
                    updateTable={this.updateTable}
                    updateField={this.updateField}
                />
            );
        }
        return (
            <div className="MetadataEditor flex flex-column flex-full p3">
                <MetadataHeader
                    databaseId={this.props.databaseId}
                    databases={this.props.databases}
                    selectDatabase={this.props.selectDatabase}
                    saving={this.state.saving}
                    isShowingSchema={this.state.isShowingSchema}
                    toggleShowSchema={this.toggleShowSchema}
                />
                <div className="MetadataEditor-main flex flex-row flex-full mt2">
                    <MetadataTableList
                        tableId={this.props.tableId}
                        tables={this.props.tables}
                        selectTable={this.props.selectTable}
                    />
                    {content}
                </div>
            </div>
        );
    }
});
