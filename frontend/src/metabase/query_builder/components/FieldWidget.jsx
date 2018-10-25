import React, { Component } from "react";
import PropTypes from "prop-types";

import FieldList from "./FieldList.jsx";
import FieldName from "./FieldName.jsx";
import Popover from "metabase/components/Popover.jsx";

import Query from "metabase/lib/query";

import _ from "underscore";
import cx from "classnames";

export default class FieldWidget extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      isOpen: props.isInitiallyOpen || false,
    };

    _.bindAll(this, "toggle", "setField");
  }

  static propTypes = {
    field: PropTypes.oneOfType([PropTypes.number, PropTypes.array]),
    fieldOptions: PropTypes.object.isRequired,
    customFieldOptions: PropTypes.object,
    setField: PropTypes.func.isRequired,
    onRemove: PropTypes.func,
    isInitiallyOpen: PropTypes.bool,
    tableMetadata: PropTypes.object.isRequired,
    enableSubDimensions: PropTypes.bool,
    useOriginalDimension: PropTypes.bool,
  };

  static defaultProps = {
    color: "brand",
    enableSubDimensions: true,
    useOriginalDimension: false,
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
        <Popover ref="popover" className="FieldPopover" onClose={this.toggle}>
          <FieldList
            className={"text-" + this.props.color}
            tableMetadata={this.props.tableMetadata}
            field={this.props.field}
            fieldOptions={this.props.fieldOptions}
            customFieldOptions={this.props.customFieldOptions}
            onFieldChange={this.setField}
            enableSubDimensions={this.props.enableSubDimensions}
            useOriginalDimension={this.props.useOriginalDimension}
          />
        </Popover>
      );
    }
  }

  render() {
    const { className, field, query } = this.props;
    return (
      <div className="flex align-center">
        <FieldName
          className={cx(className, "QueryOption")}
          field={field}
          query={query}
          tableMetadata={this.props.tableMetadata}
          fieldOptions={this.props.fieldOptions}
          customFieldOptions={this.props.customFieldOptions}
          onRemove={this.props.onRemove}
          onClick={this.toggle}
        />
        {this.renderPopover()}
      </div>
    );
  }
}
