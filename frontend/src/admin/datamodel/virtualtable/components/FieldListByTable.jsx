import React, { Component, PropTypes } from "react";
import _ from "underscore";

import FieldList from "./FieldList.jsx";


export default class FieldListByTable extends Component {

    renderJoin(join, fields) {
        const { metadata } = this.props;

        const targetTable = metadata[join.target_table_id];
        const targetFieldIds = _.pluck(targetTable.fields, "id");

        if (!_.some(fields, (f) => f.source === "join" && _.contains(targetFieldIds, f.field_id))) {
            return null;
        }

        return (
            <div key={join.hash} className="pt2">
                <h5 className="text-uppercase text-grey-4 pb1">{targetTable.display_name}</h5>
                <FieldList
                    fields={fields.filter((f) => f.source === "join" && _.contains(targetFieldIds, f.field_id))}
                    isChecked={(field) => field.included}
                    onToggleChecked={(field, checked) => checked ? this.props.includeField(field) : this.props.excludeField(field)}
                    canAction={() => false}
                />
            </div>
        );
    }

    render() {
        const { fields, metadata, virtualTable } = this.props;

        return (
            <div>
                {/* Always rendering the base table and its fields as the first table. */}
                {fields && fields.length > 0 && _.some(fields, (f) => f.source === "core") &&
                    <div>
                        <h5 className="text-uppercase text-grey-4 pb1">{metadata[virtualTable.table_id].display_name}</h5>
                        <FieldList
                            fields={fields.filter((f) => f.source === "core")}
                            isChecked={(field) => field.included}
                            onToggleChecked={(field, checked) => checked ? this.props.includeField(field) : this.props.excludeField(field)}
                            canAction={() => false}
                        />
                    </div>
                }

                {/* Next come any of our join tables */}
                {virtualTable && virtualTable.joins && virtualTable.joins.length > 0 && virtualTable.joins.map((join) =>
                    this.renderJoin(join, fields)
                )}

                {/* Always put any custom field definitions at the end */}
                {fields && fields.length > 0 && _.some(fields, (f) => f.source === "custom") &&
                    <div className="pt2">
                        <h5 className="text-uppercase text-grey-4 pb1">Custom</h5>
                        <FieldList
                            fields={fields.filter((f) => f.source === "custom")}
                            isChecked={(field) => field.included}
                            onToggleChecked={(field, checked) => checked ? this.props.includeField(field) : this.props.excludeField(field)}
                            canAction={() => true}
                            onAction={(field) => this.props.uiEditCustomField(field)}
                        />
                    </div>
                }
            </div>
        );
    }
}
