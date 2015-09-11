"use strict";

import _ from "underscore";

import ColumnarSelector from "metabase/components/ColumnarSelector.react";

import Query from "metabase/lib/query";

export default React.createClass({
    displayName: "FieldSelector",
    propTypes: {
        field: React.PropTypes.oneOfType([React.PropTypes.number, React.PropTypes.array]),
        fieldOptions: React.PropTypes.object.isRequired,
        tableName: React.PropTypes.string,
        setField: React.PropTypes.func.isRequired
    },

    getInitialState: function() {
        return {
            // must use "undefined" not "null" since null signifies the table itself is "selected" in the first column
            partialField: undefined
        };
    },

    setField: function(field) {
        if (Query.isValidField(field)) {
            this.setState({ partialField: undefined });
            this.props.setField(field);
        } else {
            this.setState({ partialField: field });
        }
    },

    render: function() {
        var field = this.state.partialField !== undefined ? this.state.partialField : this.props.field;

        var sourceTable = {
            title: this.props.tableName || null,
            field: null
        };

        if (!this.props.fieldOptions) {
            return <div>blah</div>;
        }

        var connectionTables = this.props.fieldOptions.fks
            .map((fk) => {
                return {
                    title: fk.field.display_name,
                    subtitle: this.props.tableName || null,
                    field: ["fk->", fk.field.id, null],
                    fieldId: fk.field.id
                };
            });

        var tableSections = [
            {
                title: "Source",
                items: [sourceTable]
            }
        ];
        if (connectionTables.length > 0) {
            tableSections.push({
                title: "Connections",
                items: connectionTables
            });
        }

        var tableColumn = {
            sections: tableSections,
            selectedItem: null,
            itemTitleFn: (table) => {
                var subtitleElement = table.subtitle ? <div className="text-grey-3 mb1">{table.subtitle}</div> : null;
                return (
                    <div>
                        {subtitleElement}
                        <div>{table.title}</div>
                    </div>
                );
            },
            itemSelectFn: (table) => {
                this.setField(table.field);
            }
        }

        var fieldColumn = {
            items: null,
            selectedItem: null,
            itemTitleFn: (field) => field.display_name,
            itemSelectFn: null
        };

        if (field == undefined || typeof field === "number" || field[0] === "aggregation") {
            tableColumn.selectedItem = sourceTable;
            fieldColumn.items = this.props.fieldOptions.fields;
            fieldColumn.selectedItem = _.find(this.props.fieldOptions.fields, (f) => _.isEqual(f.id, field));
            fieldColumn.itemSelectFn = (f) => {
                this.setField(f.id);
            }
        } else {
            tableColumn.selectedItem = _.find(connectionTables, (t) => _.isEqual(t.fieldId, field[1]));
            fieldColumn.items = _.find(this.props.fieldOptions.fks, (fk) => _.isEqual(fk.field.id, tableColumn.selectedItem.fieldId)).fields;
            fieldColumn.selectedItem = _.find(fieldColumn.items, (f) => _.isEqual(f.id, field[2]));
            fieldColumn.itemSelectFn = (f) => {
                this.setField(["fk->", field[1], f.id]);
            }
        }

        var columns = [
            tableColumn,
            fieldColumn
        ];

        return (
            <ColumnarSelector columns={columns}/>
        );
    }
});
