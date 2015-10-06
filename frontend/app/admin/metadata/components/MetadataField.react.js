import Input from "metabase/components/Input.react";
import Select from "metabase/components/Select.react";

import MetabaseCore from "metabase/lib/core";

import _  from "underscore";

export default React.createClass({
    displayName: "MetadataField",
    propTypes: {
        field: React.PropTypes.object,
        idfields: React.PropTypes.array.isRequired,
        updateField: React.PropTypes.func.isRequired,
        updateFieldSpecialType: React.PropTypes.func.isRequired,
        updateFieldTarget: React.PropTypes.func.isRequired
    },

    isVisibilityType: function(visibility) {
        switch(visibility.id) {
            case "do_not_include": return (this.props.field.field_type === "sensitive");
            case "everywhere": return (this.props.field.field_type !== "sensitive" && this.props.field.preview_display === true);
            case "detail_views": return (this.props.field.field_type !== "sensitive" && this.props.field.preview_display === false);
        }

        return false;
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

    onVisibilityChange: function(visibility) {
        switch(visibility.id) {
            case "do_not_include":
                this.updateProperty("field_type", "sensitive");
                return;
            case "everywhere":
                if (this.props.field.field_type === "sensitive") {
                    this.props.field.field_type = "info";
                }
                this.updateProperty("preview_display", true);
                return;
            case "detail_views":
                if (this.props.field.field_type === "sensitive") {
                    this.props.field.field_type = "info";
                }
                this.updateProperty("preview_display", false);
                return;
        }
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
            <li className="mt1 mb3">
                <div>
                    <Input style={{minWidth: 420}} className="AdminInput TableEditor-field-name float-left bordered inline-block rounded text-bold" type="text" value={this.props.field.display_name} onBlurChange={this.onNameChange}/>
                    <div className="clearfix">
                        <div className="flex flex-full">
                            <div className="flex-full px1">
                                <Select
                                    className="TableEditor-field-visibility block"
                                    placeholder="Select a field visibility"
                                    value={_.find(MetabaseCore.field_visibility_types, this.isVisibilityType)}
                                    options={MetabaseCore.field_visibility_types}
                                    onChange={this.onVisibilityChange}
                                />
                            </div>
                            <div className="flex-full px1">
                                <Select
                                    className="TableEditor-field-type block"
                                    placeholder="Select a field type"
                                    value={_.find(MetabaseCore.field_field_types, (type) => type.id === this.props.field.field_type)}
                                    options={MetabaseCore.field_field_types}
                                    onChange={this.onTypeChange}
                                />
                            </div>
                            <div className="flex-full px1">
                                <Select
                                    className="TableEditor-field-special-type block"
                                    placeholder="Select a special type"
                                    value={_.find(MetabaseCore.field_special_types, (type) => type.id === this.props.field.special_type)}
                                    options={MetabaseCore.field_special_types}
                                    onChange={this.onSpecialTypeChange}
                                />
                                {targetSelect}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="MetadataTable-title flex flex-column flex-full bordered rounded mt1 mr1">
                    <Input className="AdminInput TableEditor-field-description" type="text" value={this.props.field.description} onBlurChange={this.onDescriptionChange} placeholder="No column description yet" />
                </div>
            </li>
        )
    }
})
