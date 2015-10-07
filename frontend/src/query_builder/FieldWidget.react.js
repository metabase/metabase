import React, { Component, PropTypes } from "react";

import FieldList from "./FieldList.react";
import FieldName from "./FieldName.react";
import Popover from "metabase/components/Popover.react";

import Query from "metabase/lib/query";

import _ from "underscore";

export default class FieldWidget extends Component {
    constructor(props) {
        super(props);

        this.state = {
            isOpen: props.isInitiallyOpen || false
        };

        _.bindAll(this, "toggle", "setField");
    }

    setField(value) {
        this.props.setField(value);
        if (Query.isValidField(value)) {
            this.toggle();
        }
    }

    toggle() {
        this.setState({ isOpen: !this.state.isOpen });
    }

    renderPopover() {
        if (this.state.isOpen) {
            return (
                <Popover
                    ref="popover"
                    className="FieldPopover"
                    onClose={this.toggle}
                >
                    <FieldList
                        className={"text-" + this.props.color}
                        tableMetadata={this.props.tableMetadata}
                        field={this.props.field}
                        fieldOptions={this.props.fieldOptions}
                        onFieldChange={this.setField}
                        enableTimeGrouping={true}
                    />
                </Popover>
            );
        }
    }

    render() {
        return (
            <div className="flex align-center">
                <FieldName
                    className={this.props.className}
                    tableMetadata={this.props.tableMetadata}
                    field={this.props.field}
                    fieldOptions={this.props.fieldOptions}
                    removeField={this.props.removeField}
                    onClick={this.toggle}
                />
                {this.renderPopover()}
            </div>
        );
    }
}

FieldWidget.propTypes = {
    field: PropTypes.oneOfType([PropTypes.number, PropTypes.array]),
    fieldOptions: PropTypes.object.isRequired,
    setField: PropTypes.func.isRequired,
    removeField: PropTypes.func,
    isInitiallyOpen: PropTypes.bool,
    tableMetadata: PropTypes.object.isRequired
};

FieldWidget.defaultProps = {
    color: "brand"
};
