'use strict';

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
        tables: React.PropTypes.object.isRequired,
        selectTable: React.PropTypes.func.isRequired,
        idfields: React.PropTypes.array.isRequired,
        updateTable: React.PropTypes.func.isRequired,
        updateField: React.PropTypes.func.isRequired,
        updateFieldSpecialType: React.PropTypes.func.isRequired,
        updateFieldTarget: React.PropTypes.func.isRequired
    },

    getInitialState: function() {
        return {
            isShowingSchema: false
        }
    },

    toggleShowSchema: function() {
        this.setState({ isShowingSchema: !this.state.isShowingSchema });
    },

    handleSaveResult: function(promise) {
        this.refs.header.setSaving();
        promise.then(() => {
            this.refs.header.setSaved();
        }, (error) => {
            this.refs.header.setSaveError(error.data);
        });
    },

    updateTable: function(table) {
        this.handleSaveResult(this.props.updateTable(table));
    },

    updateField: function(field) {
        this.handleSaveResult(this.props.updateField(field));
    },

    updateFieldSpecialType: function(field) {
        this.handleSaveResult(this.props.updateFieldSpecialType(field));
    },

    updateFieldTarget: function(field) {
        this.handleSaveResult(this.props.updateFieldTarget(field));
    },

    render: function() {
        var table = this.props.tables[this.props.tableId];
        var content;
        if (table) {
            if (this.state.isShowingSchema) {
                content = (<MetadataSchema table={table} />);
            } else {
                content = (
                    <MetadataTable
                        table={table}
                        idfields={this.props.idfields}
                        updateTable={this.updateTable}
                        updateField={this.updateField}
                        updateFieldSpecialType={this.updateFieldSpecialType}
                        updateFieldTarget={this.updateFieldTarget}
                    />
                );
            }
        } else {
            content = (
                <div className="flex flex-full layout-centered">
                    <h2 className="text-grey-3">Select any table to see its schema and add or edit metadata.</h2>
                </div>
            );
        }
        return (
            <div className="MetadataEditor flex flex-column flex-full p3">
                <MetadataHeader
                    ref="header"
                    databaseId={this.props.databaseId}
                    databases={this.props.databases}
                    selectDatabase={this.props.selectDatabase}
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
