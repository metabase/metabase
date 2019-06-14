import React, { Component } from "react";
import PropTypes from "prop-types";

import _ from "underscore";

/**
 * A small wrapper around <input>, primarily should be used for the
 * `onBlurChange` feature, otherwise you should use <input> directly
 */
export default class InputBlurChange extends Component {
  constructor(props, context) {
    super(props, context);
    this.onBlur = this.onBlur.bind(this);
    this.onChange = this.onChange.bind(this);
    this.state = { value: props.value };
  }

  static propTypes = {
    type: PropTypes.string,
    value: PropTypes.string,
    placeholder: PropTypes.string,
    onChange: PropTypes.func,
    onBlurChange: PropTypes.func,
  };

  static defaultProps = {
    type: "text",
  };

  componentWillReceiveProps(newProps) {
    this.setState({ value: newProps.value });
  }

  onChange(event) {
    this.setState({ value: event.target.value });
    if (this.props.onChange) {
      this.props.onChange(event);
    }
  }

  onBlur(event) {
    if (
      this.props.onBlurChange &&
      (this.props.value || "") !== event.target.value
    ) {
      this.props.onBlurChange(event);
    }
  }

  render() {
    const props = _.omit(
      this.props,
      "onBlurChange",
      "value",
      "onBlur",
      "onChange",
    );
    return (
      <input
        {...props}
        value={this.state.value}
        onBlur={this.onBlur}
        onChange={this.onChange}
      />
    );
  }
}
