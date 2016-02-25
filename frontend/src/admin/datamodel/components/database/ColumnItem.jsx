import React, { Component, PropTypes } from "react";

import Input from "metabase/components/Input.jsx";
import Select from "metabase/components/Select.jsx";

import * as MetabaseCore from "metabase/lib/core";
import { titleize, humanize } from "metabase/lib/formatting";
import { isNumeric } from "metabase/lib/schema_metadata";

import _  from "underscore";

export default class Column extends Component {
    constructor(props, context) {
        super(props, context);
        this.isVisibilityType = this.isVisibilityType.bind(this);
        this.onDescriptionChange = this.onDescriptionChange.bind(this);
        this.onNameChange = this.onNameChange.bind(this);
        this.onSpecialTypeChange = this.onSpecialTypeChange.bind(this);
        this.onTargetChange = this.onTargetChange.bind(this);
        this.onTypeChange = this.onTypeChange.bind(this);
        this.onVisibilityChange = this.onVisibilityChange.bind(this);
    }

    static propTypes = {
        field: PropTypes.object,
        idfields: PropTypes.array.isRequired,
        updateField: PropTypes.func.isRequired,
        updateFieldSpecialType: PropTypes.func.isRequired,
        updateFieldTarget: PropTypes.func.isRequired
    };

    isVisibilityType(visibility) {
        switch(visibility.id) {
            case "do_not_include": return (this.props.field.field_type === "sensitive");
            case "everywhere": return (this.props.field.field_type !== "sensitive" && this.props.field.preview_display === true);
            case "detail_views": return (this.props.field.field_type !== "sensitive" && this.props.field.preview_display === false);
        }

        return false;
    }

    updateProperty(name, value) {
        this.props.field[name] = value;
        this.props.updateField(this.props.field);
    }

    onNameChange(event) {
        if (!_.isEmpty(event.target.value)) {
            this.updateProperty("display_name", event.target.value);
        } else {
            // if the user set this to empty then simply reset it because that's not allowed!
            event.target.value = this.props.field.display_name;
        }
    }

    onDescriptionChange(event) {
        this.updateProperty("description", event.target.value);
    }

    onVisibilityChange(visibility) {
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
    }

    onTypeChange(type) {
        this.updateProperty("field_type", type.id);
    }

    onSpecialTypeChange(special_type) {
        this.props.field.special_type = special_type.id;
        this.props.updateFieldSpecialType(this.props.field);
    }

    onTargetChange(target_field) {
        this.props.field.target_id = target_field.id;
        this.props.updateFieldTarget(this.props.field);
    }

    render() {
        var targetSelect;
        if (this.props.field.special_type === "fk") {
            targetSelect = (
                <Select
                    className="TableEditor-field-target block"
                    placeholder="Select a target"
                    value={this.props.field.target && _.find(this.props.idfields, (field) => field.id === this.props.field.target.id)}
                    options={this.props.idfields}
                    optionNameFn={(field) => field.table.schema && field.table.schema !== "public" ? titleize(humanize(field.table.schema))+"."+field.displayName : field.displayName}
                    onChange={this.onTargetChange}
                />
            );
        }

        let specialTypes = MetabaseCore.field_special_types.slice(0);
        specialTypes.push({'id': null, 'name': 'No special type', 'section': 'Other'});
        // if we don't have a numeric base-type then prevent the options for unix timestamp conversion (#823)
        if (!isNumeric(this.props.field)) {
            specialTypes = specialTypes.filter((f) => !(f.id && f.id.startsWith("timestamp_")));
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
                                    options={specialTypes}
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
}
