"use strict";
/*global _*/

import Icon from "./icon.react";

import Query from "./query";

var cx = React.addons.classSet;

export default React.createClass({
    displayName: "FieldName",
    propTypes: {
        fields: React.PropTypes.array.isRequired,
        onClick: React.PropTypes.func
    },

    getDefaultProps: function() {
        return {
            className: ""
        };
    },

    render: function() {
        var targetTitle, fkTitle, fkIcon;
        var field = this.props.field;

        if (Array.isArray(field)) {
            var fkDef = _.find(this.props.fields, (f) => f.id === field[1]);
            var targetDef = fkDef && _.find(fkDef.target.table.fields, (f) => f.id === field[2]);
            targetTitle = targetDef && (<span>{targetDef.display_name}</span>);
            fkTitle = fkDef && (<span>{fkDef.display_name}</span>);
            fkIcon = fkDef && targetDef && (<span className="px1"><Icon name="connections" width="10" height="10" /></span>);
        } else {
            var fieldDef = _.find(this.props.fields, (f) => f.id === field);
            targetTitle = fieldDef && (<span>{fieldDef.display_name}</span>);
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

        return (
            <div className={this.props.className + " " + classes} onClick={this.props.onClick}>
                {titleElement}
            </div>
        );
    },
});
