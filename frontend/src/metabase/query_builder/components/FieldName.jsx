import React, { Component } from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon.jsx";
import Clearable from "./Clearable.jsx";

import Query from "metabase/lib/query";
import { formatBucketing } from "metabase/lib/query_time";
import { stripId } from "metabase/lib/formatting";

import _ from "underscore";
import cx from "classnames";

export default class FieldName extends Component {
    static propTypes = {
        field: PropTypes.oneOfType([PropTypes.number, PropTypes.array]),
        fieldOptions: PropTypes.object.isRequired,
        customFieldOptions: PropTypes.object,
        onClick: PropTypes.func,
        removeField: PropTypes.func,
        tableMetadata: PropTypes.object.isRequired
    };

    static defaultProps = {
        className: ""
    };

    displayNameForFieldLiteral(tableMetadata, fieldLiteral) {
        // see if we can find an entry in the table metadata that matches the field literal
        let matchingField = _.find(tableMetadata.fields, (field) => Query.isFieldLiteral(field.id) && field.id[1] === fieldLiteral[1]); // check whether names of field literals match

        return (matchingField && matchingField.display_name) || fieldLiteral[1];
    }

    render() {
        let { field, tableMetadata, className } = this.props;
        let fieldTarget = Query.getFieldTarget(field, tableMetadata);

        let parts = [];

        // if the Field in question is a field literal, e.g. ["field-literal", <name>, <type>] just use name as-is
        if (Query.isFieldLiteral(field)) {
            parts.push(<span key="field">{this.displayNameForFieldLiteral(tableMetadata, field)}</span>);
        }
        // otherwise if for some weird reason we wound up with a Field Literal inside a field ID,
        // e.g. ["field-id", ["field-literal", <name>, <type>], still just use the name as-is
        else if (Query.isLocalField(field) && Query.isFieldLiteral(field[1])) {
            parts.push(<span key="field">{this.displayNameForFieldLiteral(tableMetadata, field[1])}</span>);
        }
        else if (fieldTarget && !fieldTarget.field) {
            parts.push(<span className="text-error" key="field">Missing Field</span>);
        } else if (fieldTarget) {
            // fk path
            for (let [index, fkField] of Object.entries(fieldTarget.path)) {
                parts.push(<span key={"fkName"+index}>{stripId(fkField.display_name)}</span>);
                parts.push(<span key={"fkIcon"+index} className="px1"><Icon name="connections" size={10} /></span>);
            }
            if (fieldTarget.field.id != null) {
                parts.push(<span key="field">{Query.getFieldPathName(fieldTarget.field.id, fieldTarget.table)}</span>);
            } else {
                // expressions, etc
                parts.push(<span key="field">{fieldTarget.field.display_name}</span>);
            }
            // datetime-field unit
            if (fieldTarget.unit != null) {
                parts.push(<span key="unit">{": " + formatBucketing(fieldTarget.unit)}</span>);
            }
        } else {
            parts.push(<span key="field">field</span>);
        }

        return (
            <Clearable onClear={this.props.removeField}>
                <div className={cx(className, { selected: Query.isValidField(field) })} onClick={this.props.onClick}>
                    <span className="QueryOption">{parts}</span>
                </div>
            </Clearable>
        );
    }
}
