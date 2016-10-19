import React, { Component, PropTypes } from "react";

import i from 'icepick';

import Icon from "metabase/components/Icon.jsx";

import Query from "metabase/lib/query";
import { formatBucketing } from "metabase/lib/query_time";
import { stripId } from "metabase/lib/formatting";

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

    render() {
        let { field, tableMetadata, className } = this.props;
        let fieldTarget = Query.getFieldTarget(field, tableMetadata);

        let parts = [];

        if (fieldTarget) {
            // fk path
            for (let [index, fkField] of Object.entries(fieldTarget.path)) {
                parts.push(<span key={"fkName"+index}>{stripId(fkField.display_name)}</span>);
                parts.push(<span key={"fkIcon"+index} className="px1"><Icon name="connections" size={10} /></span>);
            }
            // target field itself
            // using i.getIn to avoid exceptions when field is undefined
            parts.push(<span key="field">{i.getIn(fieldTarget, ['field', 'display_name'])}</span>);
            // datetime-field unit
            if (fieldTarget.unit != null) {
                parts.push(<span key="unit">{": " + formatBucketing(fieldTarget.unit)}</span>);
            }
        } else {
            parts.push(<span key="field">field</span>);
        }

        return (
            <div className="flex align-center">
                <div className={cx(className, { selected: Query.isValidField(field) })} onClick={this.props.onClick}>
                    <span className="QueryOption">{parts}</span>
                </div>
                { this.props.removeField &&
                    <a className="text-grey-2 no-decoration pr1 flex align-center" onClick={this.props.removeField}>
                        <Icon name='close' size={14} />
                    </a>
                }
            </div>
        );
    }
}
