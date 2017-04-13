import React, { Component } from "react";
import PropTypes from "prop-types";

import FieldList from "./FieldList.jsx";
import FieldName from "./FieldName.jsx";
import Popover from "metabase/components/Popover.jsx";

import Query from "metabase/lib/query";

import _ from "underscore";

export default class FieldWidget extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            isOpen: props.isInitiallyOpen || false
        };

        _.bindAll(this, "toggle", "setField");
    }

    static propTypes = {
        field: PropTypes.oneOfType([PropTypes.number, PropTypes.array]),
        fieldOptions: PropTypes.object.isRequired,
        customFieldOptions: PropTypes.object,
        setField: PropTypes.func.isRequired,
        removeField: PropTypes.func,
        isInitiallyOpen: PropTypes.bool,
        tableMetadata: PropTypes.object.isRequired,
        enableTimeGrouping: PropTypes.bool
    };

    static defaultProps = {
        color: "brand",
        enableTimeGrouping: true
    };

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
                        customFieldOptions={this.props.customFieldOptions}
                        onFieldChange={this.setField}
                        enableTimeGrouping={this.props.enableTimeGrouping}
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
                    customFieldOptions={this.props.customFieldOptions}
                    removeField={this.props.removeField}
                    onClick={this.toggle}
                />
                {this.renderPopover()}
            </div>
        );
    }
}
