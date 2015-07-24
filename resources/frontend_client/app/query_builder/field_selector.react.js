"use strict";
/*global _*/

import ColumnarSelector from "./columnar_selector.react";

export default React.createClass({
    displayName: "FieldSelector",
    propTypes: {
        field: React.PropTypes.oneOfType([React.PropTypes.number, React.PropTypes.array]),
        fieldOptions: React.PropTypes.object.isRequired,
        tableName: React.PropTypes.string,
        setField: React.PropTypes.func.isRequired
    },

    render: function() {
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
            fieldColumn.items = this.props.fieldOptions.fields;
            fieldColumn.selectedItem = _.find(this.props.fieldOptions.fields, (f) => f.id === this.props.field);
            fieldColumn.itemSelectFn = (f) => {
                this.props.setField(f.id);
            }
        } else {
            tableColumn.selectedItem = _.find(connectionTables, (t) => t.fieldId === this.props.field[1]);
            fieldColumn.items = _.find(this.props.fieldOptions.fks, (fk) => fk.field.id === tableColumn.selectedItem.fieldId).fields;
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
