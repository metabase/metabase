import React, { Component } from "react";
import PropTypes from "prop-types";

import FieldList from "./FieldList.jsx";
import FieldName from "./FieldName.jsx";
import Popover from "metabase/components/Popover.jsx";

import _ from "underscore";
import cx from "classnames";

export default class BreakoutWidget extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      isOpen: props.isInitiallyOpen || false,
    };

    _.bindAll(this, "open", "close", "setBreakout");
  }

  static propTypes = {
    addButton: PropTypes.object,
    field: PropTypes.oneOfType([PropTypes.number, PropTypes.array]),
    fieldOptions: PropTypes.object.isRequired,
    customFieldOptions: PropTypes.object,
    setField: PropTypes.func.isRequired,
    isInitiallyOpen: PropTypes.bool,
    tableMetadata: PropTypes.object.isRequired,
    enableSubDimensions: PropTypes.bool,
  };

  static defaultProps = {
    enableSubDimensions: true,
  };

  setBreakout(value) {
    this.props.setField(value);
    this.close();
  }

  open() {
    this.setState({ isOpen: true });
  }

  close() {
    this.setState({ isOpen: false });
  }

  renderPopover() {
    if (this.state.isOpen) {
      return (
        <Popover
          id="BreakoutPopover"
          ref="popover"
          className="FieldPopover"
          onClose={this.close}
        >
          <FieldList
            className={"text-green"}
            tableMetadata={this.props.tableMetadata}
            field={this.props.field}
            fieldOptions={this.props.fieldOptions}
            customFieldOptions={this.props.customFieldOptions}
            onFieldChange={this.setBreakout}
            enableSubDimensions={this.props.enableSubDimensions}
          />
        </Popover>
      );
    }
  }

  render() {
    // if we have a field then render FieldName, otherwise display our + option if enabled
    const { addButton, field, fieldOptions } = this.props;

    if (field) {
      return (
        <div className="flex align-center">
          <FieldName
            className={cx(this.props.className, "QueryOption")}
            tableMetadata={this.props.tableMetadata}
            field={field}
            fieldOptions={this.props.fieldOptions}
            customFieldOptions={this.props.customFieldOptions}
            onRemove={() => this.setBreakout(null)}
            onClick={this.open}
          />
          {this.renderPopover()}
        </div>
      );
    } else if (addButton && fieldOptions && fieldOptions.count > 0) {
      return (
        <div id="BreakoutWidget" onClick={this.open}>
          {addButton}
          {this.renderPopover()}
        </div>
      );
    } else {
      // this needs to be here to prevent React error (#2304)
      return null;
    }
  }
}
