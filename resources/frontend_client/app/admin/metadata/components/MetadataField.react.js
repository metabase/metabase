"use strict";
/*global _*/

import Input from "metabase/components/Input.react";
import Select from "metabase/components/Select.react";
import Icon from "metabase/components/Icon.react";

import MetabaseCore from 'metabase/lib/core';

export default React.createClass({
    displayName: "MetadataField",
    propTypes: {
        field: React.PropTypes.object,
        idfields: React.PropTypes.array.isRequired,
        updateField: React.PropTypes.func.isRequired,
        updateFieldSpecialType: React.PropTypes.func.isRequired,
        updateFieldTarget: React.PropTypes.func.isRequired
    },

    updateProperty: function(name, value) {
        this.props.field[name] = value;
        this.props.updateField(this.props.field);
    },

    onNameChange: function(event) {
        this.updateProperty("display_name", event.target.value);
    },

    onDescriptionChange: function(event) {
        this.updateProperty("description", event.target.value);
    },

    onTypeChange: function(type) {
        this.updateProperty("field_type", type.id);
    },

    onSpecialTypeChange: function(special_type) {
        this.props.field.special_type = special_type.id;
        this.props.updateFieldSpecialType(this.props.field);
    },

    onTargetChange: function(target_field) {
        this.props.field.target_id = target_field.id;
        this.props.updateFieldTarget(this.props.field);
    },

    render: function() {
        var targetSelect;
        if (this.props.field.special_type === "fk") {
            targetSelect = (
                <Select
                    className="TableEditor-field-target block"
                    placeholder="Select a target"
                    value={this.props.field.target && _.find(this.props.idfields, (field) => field.id === this.props.field.target.id)}
                    options={this.props.idfields}
                    optionNameFn={(field) => field.displayName}
                    onChange={this.onTargetChange}
                />
            );
        }

        return (
            <li className="my1 flex">
                <div className="MetadataTable-title flex flex-column flex-full bordered rounded mr1">
                    <Input className="AdminInput TableEditor-field-name text-bold border-bottom rounded-top" type="text" value={this.props.field.display_name} onBlurChange={this.onNameChange}/>
                    <Input className="AdminInput TableEditor-field-description rounded-bottom" type="text" value={this.props.field.description} onBlurChange={this.onDescriptionChange} placeholder="No table description yet" />
                </div>
                <div className="flex-half px1">
                    <Select
                        className="TableEditor-field-type block"
                        placeholder="Select a field type"
                        value={_.find(MetabaseCore.field_field_types, (type) => type.id === this.props.field.field_type)}
                        options={MetabaseCore.field_field_types}
                        onChange={this.onTypeChange}
                    />
                </div>
                <div className="flex-half flex flex-column justify-between px1">
                    <Select
                        className="TableEditor-field-special-type block"
                        placeholder="Select a special type"
                        value={_.find(MetabaseCore.field_special_types, (type) => type.id === this.props.field.special_type)}
                        options={MetabaseCore.field_special_types}
                        onChange={this.onSpecialTypeChange}
                    />
                    {targetSelect}
                </div>
            </li>
        )
    }
})
