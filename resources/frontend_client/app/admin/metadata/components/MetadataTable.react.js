'use strict';
/*global _*/

import Input from "metabase/components/Input.react";
import MetadataField from "./MetadataField.react";
import ProgressBar from "metabase/components/ProgressBar.react";

import cx from "classnames";

export default React.createClass({
    displayName: "MetadataTable",
    propTypes: {
        table: React.PropTypes.object,
        idfields: React.PropTypes.array.isRequired,
        updateTable: React.PropTypes.func.isRequired,
        updateField: React.PropTypes.func.isRequired,
        updateFieldSpecialType: React.PropTypes.func.isRequired,
        updateFieldTarget: React.PropTypes.func.isRequired
    },

    isHidden: function() {
        return !!this.props.table.visibility_type;
    },

    updateProperty: function(name, value) {
        this.props.table[name] = value;
        this.setState({ saving: true });
        this.props.updateTable(this.props.table);
    },

    onNameChange: function(event) {
        this.updateProperty("display_name", event.target.value);
    },

    onDescriptionChange: function(event) {
        this.updateProperty("description", event.target.value);
    },

    renderVisibilityType: function(text, type, any) {
        var classes = cx("mx1", "text-bold", "text-brand-hover", "cursor-pointer", "text-default", {
            "text-brand": this.props.table.visibility_type === type || (any && this.props.table.visibility_type)
        });
        return <span className={classes} onClick={this.updateProperty.bind(null, "visibility_type", type)}>{text}</span>;
    },

    renderVisibilityWidget: function() {
        var subTypes;
        if (this.props.table.visibility_type) {
            subTypes = (
                <span className="border-left mx2">
                    <span className="mx2 text-uppercase text-grey-3">Why Hide?</span>
                    {this.renderVisibilityType("Technical Data", "technical")}
                    {this.renderVisibilityType("Irrellevant/Cruft", "cruft")}
                </span>
            );
        }
        return (
            <span>
                {this.renderVisibilityType("Queryable", null)}
                {this.renderVisibilityType("Hidden", "hidden", true)}
                {subTypes}
            </span>
        );
    },

    render: function() {
        var table = this.props.table;
        if (!table) {
            return false;
        }

        var fields = this.props.table.fields.map((field) => {
            return (
                <MetadataField
                    key={field.id}
                    field={field}
                    idfields={this.props.idfields}
                    updateField={this.props.updateField}
                    updateFieldSpecialType={this.props.updateFieldSpecialType}
                    updateFieldTarget={this.props.updateFieldTarget}
                />
            );
        });

        return (
            <div className="MetadataTable px2 flex-full">
                <div className="MetadataTable-title flex flex-column bordered rounded">
                    <Input className="AdminInput TableEditor-table-name text-bold border-bottom rounded-top" type="text" value={this.props.table.display_name} onBlurChange={this.onNameChange}/>
                    <Input className="AdminInput TableEditor-table-description rounded-bottom" type="text" value={this.props.table.description} onBlurChange={this.onDescriptionChange} placeholder="No table description yet" />
                </div>
                <div className="MetadataTable-header flex align-center py2 text-grey-3">
                    <span className="mx1 text-uppercase">Visibility</span>
                    {this.renderVisibilityWidget()}
                    <span className="flex-align-right flex align-center">
                        <span className="text-uppercase mr1">Metadata Strength</span>
                        <ProgressBar percentage={table.metadataStrength} />
                    </span>
                </div>
                <div className={"mt2 " + (this.isHidden() ? "disabled" : "")}>
                    <div className="text-uppercase text-grey-3 py1 flex">
                        <div className="flex-full px1">Column</div>
                        <div className="flex-half px1">Type</div>
                        <div className="flex-half px1">Details</div>
                    </div>
                    <ol className="border-top border-bottom scroll-y">
                        {fields}
                    </ol>
                </div>
            </div>
        );
    }
});
