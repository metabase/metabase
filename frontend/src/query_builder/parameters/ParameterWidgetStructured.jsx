import React, { Component, PropTypes } from 'react';
import _ from 'underscore';

import FieldList from "../FieldList.jsx";

import Query from "metabase/lib/query";
import Utils from "metabase/lib/utils";


export default class ParameterWidgetStructured extends Component {

    static propTypes = {
        parameter: PropTypes.object,
        tableMetadata: PropTypes.object,
        onSetParameter: PropTypes.func.isRequired,
        onRemoveParameter: PropTypes.func.isRequired,
        onCancel: PropTypes.func.isRequired
    };

    static defaultProps = {
        parameter: {},
    }

    setField(field) {
        let { parameter } = this.props;

        if (!parameter.hash) {
            parameter.hash = Utils.uuid();
        }
        
        if (_.isNumber(field)) {
            field = ["field-id", field];
        }

        let fieldDef = Query.getFieldTarget(field, this.props.tableMetadata);
        if (fieldDef && fieldDef.field) {
            // determine the right parameter data type
            let dataType = "text";
            if (fieldDef.field.base_type === "DateTimeField") {
                dataType = "date";
            }

            this.props.onSetParameter({...parameter, name: fieldDef.field.display_name, type: dataType, field: field});
        } else {
            throw new Error("Unable to find fieldDef for field: "+field);
        }
    }

    render() {
        const { parameter, tableMetadata } = this.props;

        return (
            <div>
                <div className="py2 h4 text-bold text-dark text-centered border-bottom">Which field do you want to filter on?</div>

                <FieldList
                    className={"text-brand"}
                    tableMetadata={this.props.tableMetadata}
                    field={parameter && parameter.field}
                    fieldOptions={Query.getFieldOptions(tableMetadata.fields, true, tableMetadata.breakout_options.validFieldsFilter, {})}
                    onFieldChange={(f) => this.setField(f)}
                    enableTimeGrouping={false}
                />
            </div>
        );
    }
}
