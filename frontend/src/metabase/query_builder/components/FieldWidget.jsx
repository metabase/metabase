import React from "react";
import PropTypes from "prop-types";

import FieldList from "./FieldList";
import Clearable from "./Clearable";
import Popover from "metabase/components/Popover";

import * as FieldRef from "metabase/lib/query/field_ref";

import cx from "classnames";
import t from "ttag";

export default class FieldWidget extends React.Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      isOpen: props.isInitiallyOpen || false,
    };
  }

  static propTypes = {
    field: PropTypes.oneOfType([PropTypes.number, PropTypes.array]),
    fieldOptions: PropTypes.object.isRequired,
    onChange: PropTypes.func.isRequired,
    onRemove: PropTypes.func,
    isInitiallyOpen: PropTypes.bool,
    enableSubDimensions: PropTypes.bool,
    useOriginalDimension: PropTypes.bool,
  };

  static defaultProps = {
    color: "brand",
    enableSubDimensions: true,
    useOriginalDimension: false,
  };

  handleChangeField = value => {
    this.props.onChangeField(value);
    if (FieldRef.isValidField(value)) {
      this.toggle();
    }
  };

  toggle() {
    this.setState({ isOpen: !this.state.isOpen });
  }

  renderPopover() {
    if (this.state.isOpen) {
      return (
        <Popover ref="popover" className="FieldPopover" onClose={this.toggle}>
          <FieldList
            className={"text-" + this.props.color}
            field={this.props.field}
            fieldOptions={this.props.fieldOptions}
            onFieldChange={this.handleChangeField}
            enableSubDimensions={this.props.enableSubDimensions}
            useOriginalDimension={this.props.useOriginalDimension}
          />
        </Popover>
      );
    }
  }

  render() {
    const { className, field, query } = this.props;
    const dimension = field && query.parseFieldReference(field);
    return (
      <div className="flex align-center">
        <Clearable onClear={this.props.onRemove}>
          <span
            className={cx(className, "QueryOption text-wrap flex flex-auto")}
            onClick={this.toggle}
          >
            {dimension ? dimension.displayName() : t`Unknown Field`}
          </span>
        </Clearable>
        {this.renderPopover()}
      </div>
    );
  }
}
