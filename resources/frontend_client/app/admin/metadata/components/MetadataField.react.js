"use strict";

import Input from "./Input.react";

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

    render: function() {
        return (
            <li className="my1 flex">
                <div className="MetadataTable-title flex flex-column flex-full bordered rounded mr1">
                    <Input className="AdminInput TableEditor-field-name text-bold border-bottom rounded-top" type="text" value={this.props.field.display_name} onBlurChange={this.onNameChange}/>
                    <Input className="AdminInput TableEditor-field-description rounded-bottom" type="text" value={this.props.field.description} onBlurChange={this.onDescriptionChange} placeholder="No table description yet" />
                </div>
                <div className="flex-half">
                    <label className="Select Select--small Select--blue">
                        <select></select>
                    </label>
                </div>
                <div className="flex-half">Details</div>
            </li>
        )
    }
})
