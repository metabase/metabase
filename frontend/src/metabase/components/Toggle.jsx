import React, { Component } from "react";
import PropTypes from "prop-types";

import styles from "./Toggle.css";

import cx from "classnames";

export default class Toggle extends Component {
  constructor(props, context) {
    super(props, context);
    this.onClick = this.onClick.bind(this);
  }

  static propTypes = {
    value: PropTypes.bool.isRequired,
    onChange: PropTypes.func,
    small: PropTypes.bool,
  };

  onClick() {
    if (this.props.onChange) {
      this.props.onChange(!this.props.value);
    }
  }

  render() {
    return (
      <a
        className={cx(
          styles.toggle,
          "no-decoration",
          {
            [styles.selected]: this.props.value,
            [styles.small]: this.props.small,
          },
          this.props.className,
        )}
        style={{ color: this.props.color || null }}
        onClick={this.props.onChange ? this.onClick : null}
      />
    );
  }
}
