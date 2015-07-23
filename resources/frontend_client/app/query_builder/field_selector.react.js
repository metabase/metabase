"use strict";
/*global _*/

import ColumnarSelector from "./columnar_selector.react";

export default React.createClass({
    displayName: "FieldSelector",
    propTypes: {
        tableMetadata: React.PropTypes.object.isRequired,
        setField: React.PropTypes.func.isRequired
    },

    render: function() {
        var sourceTable = {
            title: this.props.tableMetadata.display_name,
            field: null
        };
        var connectionTables = this.props.tableMetadata.fields
            .filter((field) => field.special_type === "fk")
            .map((field) => {
                return {
                    title: field.display_name,
                    subtitle: this.props.tableMetadata.display_name,
                    field: ["fk->", field.id, null],
                    fieldId: field.id
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
                this.props.setField(table.field);
            }
        }

        var fieldColumn = {
            items: null,
            selectedItem: null,
            itemTitleFn: (field) => field.display_name,
            itemSelectFn: null
        };

        if (this.props.field == undefined || typeof this.props.field === "number") {
            tableColumn.selectedItem = sourceTable;
            fieldColumn.items = this.props.tableMetadata.fields.filter((f) => f.special_type !== 'fk');
            fieldColumn.selectedItem = _.find(fieldColumn.items, (f) => f.id === this.props.field);
            fieldColumn.itemSelectFn = (f) => {
                this.props.setField(f.id);
            }
        } else {
            tableColumn.selectedItem = _.find(connectionTables, (t) => t.fieldId === this.props.field[1]);
            fieldColumn.items = _.find(this.props.tableMetadata.fields, (f) => f.id === tableColumn.selectedItem.fieldId).target.table.fields;
            fieldColumn.selectedItem = _.find(fieldColumn.items, (f) => f.id === this.props.field[2]);
            fieldColumn.itemSelectFn = (f) => {
                this.props.setField(["fk->", this.props.field[1], f.id]);
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
