import React, { Component } from "react";
import PropTypes from "prop-types";

import styles from "./Toggle.css";

import cx from "classnames";

export default class Toggle extends Component {
  static propTypes = {
    value: PropTypes.bool.isRequired,
    onChange: PropTypes.func,
    small: PropTypes.bool,
  };

  handleClick = () => {
    if (this.props.onChange) {
      this.props.onChange(!this.props.value);
    }
  };

  render() {
    const { value, small, className, color, onChange, ...props } = this.props;
    return (
      <a
        {...props}
        className={cx(
          styles.toggle,
          "no-decoration",
          {
            [styles.selected]: value,
            [styles.small]: small,
          },
          className,
        )}
        style={{ color: color || null }}
        onClick={onChange ? this.handleClick : null}
      />
    );
  }
}
