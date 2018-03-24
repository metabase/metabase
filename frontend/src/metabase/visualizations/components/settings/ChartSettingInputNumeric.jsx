import React, { Component } from "react";

import cx from "classnames";

export default class ChartSettingInputNumeric extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = {
      value: String(props.value == null ? "" : props.value),
    };
  }

  componentWillReceiveProps(nextProps) {
    this.setState({
      value: String(nextProps.value == null ? "" : nextProps.value),
    });
  }

  render() {
    const { onChange } = this.props;
    return (
      <input
        className={cx("input block full", {
          "border-error":
            this.state.value !== "" && isNaN(parseFloat(this.state.value)),
        })}
        value={this.state.value}
        onChange={e => {
          let num = parseFloat(e.target.value);
          if (!isNaN(num) && num !== this.props.value) {
            onChange(num);
          }
          this.setState({ value: e.target.value });
        }}
        onBlur={e => {
          let num = parseFloat(e.target.value);
          if (isNaN(num)) {
            onChange(undefined);
          } else {
            onChange(num);
          }
        }}
      />
    );
  }
}
