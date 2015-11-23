import React, { Component, PropTypes } from "react";

import Input from "metabase/components/Input.jsx";
import MetadataField from "./MetadataField.jsx";
import ProgressBar from "metabase/components/ProgressBar.jsx";

import cx from "classnames";

export default class MetadataTable extends Component {
    constructor(props, context) {
        super(props, context);
        this.onDescriptionChange = this.onDescriptionChange.bind(this);
        this.onNameChange = this.onNameChange.bind(this);
        this.updateProperty = this.updateProperty.bind(this);
    }

    static propTypes = {
        table: PropTypes.object,
        idfields: PropTypes.array.isRequired,
        updateTable: PropTypes.func.isRequired,
        updateField: PropTypes.func.isRequired,
        updateFieldSpecialType: PropTypes.func.isRequired,
        updateFieldTarget: PropTypes.func.isRequired
    };

    isHidden() {
        return !!this.props.table.visibility_type;
    }

    updateProperty(name, value) {
        this.props.table[name] = value;
        this.setState({ saving: true });
        this.props.updateTable(this.props.table);
    }

    onNameChange(event) {
        this.updateProperty("display_name", event.target.value);
    }

    onDescriptionChange(event) {
        this.updateProperty("description", event.target.value);
    }

    renderVisibilityType(text, type, any) {
        var classes = cx("mx1", "text-bold", "text-brand-hover", "cursor-pointer", "text-default", {
            "text-brand": this.props.table.visibility_type === type || (any && this.props.table.visibility_type)
        });
        return <span className={classes} onClick={this.updateProperty.bind(null, "visibility_type", type)}>{text}</span>;
    }

    renderVisibilityWidget() {
        var subTypes;
        if (this.props.table.visibility_type) {
            subTypes = (
                <span className="border-left mx2">
                    <span className="mx2 text-uppercase text-grey-3">Why Hide?</span>
                    {this.renderVisibilityType("Technical Data", "technical")}
                    {this.renderVisibilityType("Irrelevant/Cruft", "cruft")}
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
    }

    render() {
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
                    <div className="text-uppercase text-grey-3 py1">
                        <div style={{minWidth: 420}} className="float-left">Column</div>
                        <div className="flex clearfix">
                            <div className="flex-half px1">Visibility</div>
                            <div className="flex-half px1">Type</div>
                            <div className="flex-half px1">Details</div>
                        </div>
                    </div>
                    <ol className="border-top border-bottom">
                        {fields}
                    </ol>
                </div>
            </div>
        );
    }
}
