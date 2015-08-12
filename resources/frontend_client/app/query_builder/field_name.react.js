"use strict";
/*global _*/

import Icon from "./icon.react";

import Query from "metabase/lib/query";

var cx = React.addons.classSet;

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
        var targetTitle, fkTitle, fkIcon;
        var field = this.props.field;

        if (Array.isArray(field) && field[0] === 'fk->') {
            var fkDef = _.find(this.props.fieldOptions.fks, (fk) => _.isEqual(fk.field.id, field[1]));
            if (fkDef) {
                fkTitle = (<span>{fkDef.field.display_name}</span>);
                var targetDef = _.find(fkDef.fields, (f) => _.isEqual(f.id, field[2]));
                if (targetDef) {
                    targetTitle = (<span>{targetDef.display_name}</span>);
                    fkIcon = (<span className="px1"><Icon name="connections" width="10" height="10" /></span>);
                }
            }
        } else {
            var fieldDef = _.find(this.props.fieldOptions.fields, (f) => _.isEqual(f.id, field));
            if (fieldDef) {
                targetTitle = (<span>{fieldDef.display_name}</span>);
            }
        }

        var titleElement;
        if (fkTitle || targetTitle) {
            titleElement = <span className="QueryOption">{fkTitle}{fkIcon}{targetTitle}</span>;
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
