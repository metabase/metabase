"use strict";

import Input from "./Input.react";
import Select from "./Select.react";
import Icon from '../../../query_builder/icon.react';

import MetabaseCore from 'metabase/lib/core';

export default React.createClass({
    displayName: "MetadataField",
    propTypes: {
        field: React.PropTypes.object,
        updateField: React.PropTypes.func.isRequired
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
        this.updateProperty("special_type", special_type.id);
    },

    render: function() {
        var typeSelect = (
            <Select
                className="TableEditor-field-type"
                value={_.find(MetabaseCore.field_field_types, (type) => type.id === this.props.field.field_type)}
                options={MetabaseCore.field_field_types}
                onChange={this.onTypeChange}
            />
        );

        var specialTypeSelect = (
            <Select
                className="TableEditor-field-special-type"
                value={_.find(MetabaseCore.field_special_types, (type) => type.id === this.props.field.special_type)}
                options={MetabaseCore.field_special_types}
                onChange={this.onSpecialTypeChange}
            />
        );

        return (
            <li className="my1 flex">
                <div className="MetadataTable-title flex flex-column flex-full bordered rounded mr1">
                    <Input className="AdminInput TableEditor-field-name text-bold border-bottom rounded-top" type="text" value={this.props.field.display_name} onBlurChange={this.onNameChange}/>
                    <Input className="AdminInput TableEditor-field-description rounded-bottom" type="text" value={this.props.field.description} onBlurChange={this.onDescriptionChange} placeholder="No table description yet" />
                </div>
                <div className="flex-half px1">
                    {typeSelect}
                </div>
                <div className="flex-half flex flex-column justify-between px1">
                    {specialTypeSelect}
                    <div className="AdminSelect flex align-center">
                        <span>To → User Login</span>
                        <Icon className="flex-align-right" name="chevrondown"  width="10" height="10"/>
                    </div>
                </div>
            </li>
        )
    }
})
