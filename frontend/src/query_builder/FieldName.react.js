import _ from "underscore";

import Icon from "metabase/components/Icon.react";

import Query from "metabase/lib/query";
import { parseFieldTarget, parseFieldBucketing, formatBucketing } from "metabase/lib/query_time";
import { isDate } from "metabase/lib/schema_metadata";

import { stripId } from "metabase/lib/formatting";

import cx from "classnames";

export default React.createClass({
    displayName: "FieldName",
    propTypes: {
        field: React.PropTypes.oneOfType([React.PropTypes.number, React.PropTypes.array]),
        fieldOptions: React.PropTypes.object.isRequired,
        onClick: React.PropTypes.func,
        removeField: React.PropTypes.func
    },

    getDefaultProps: function() {
        return {
            className: ""
        };
    },

    render: function() {
        let targetTitle, fkTitle, fkIcon, bucketingTitle;
        let { field, fieldOptions } = this.props;

        let bucketing = parseFieldBucketing(field);
        field = parseFieldTarget(field);

        let fieldDef;
        if (Array.isArray(field) && field[0] === 'fk->') {
            let fkDef = _.find(fieldOptions.fks, (fk) => _.isEqual(fk.field.id, field[1]));
            if (fkDef) {
                fkTitle = (<span>{stripId(fkDef.field.display_name)}</span>);
                fieldDef = _.find(fkDef.fields, (f) => _.isEqual(f.id, field[2]));
                if (fieldDef) {
                    fkIcon = (<span className="px1"><Icon name="connections" width="10" height="10" /></span>);
                }
            }
        } else {
            fieldDef = _.find(fieldOptions.fields, (f) => _.isEqual(f.id, field));
        }

        if (fieldDef) {
            targetTitle = (<span>{fieldDef.display_name}</span>);
        }

        if (fieldDef && isDate(fieldDef)) {
            bucketingTitle = ": " + formatBucketing(bucketing);
        }

        var titleElement;
        if (fkTitle || targetTitle) {
            titleElement = <span className="QueryOption">{fkTitle}{fkIcon}{targetTitle}{bucketingTitle}</span>;
        } else {
            titleElement = <span className="QueryOption">field</span>;
        }

        var classes = cx({
            'selected': Query.isValidField(field)
        });

        var removeButton;
        if (this.props.removeField) {
            removeButton = (
                <a className="text-grey-2 no-decoration pr1 flex align-center" href="#" onClick={this.props.removeField}>
                    <Icon name='close' width="14px" height="14px" />
                </a>
            )
        }

        return (
            <div className="flex align-center">
                <div className={this.props.className + " " + classes} onClick={this.props.onClick}>
                    {titleElement}
                </div>
                {removeButton}
            </div>
        );
    },
});
