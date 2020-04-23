import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import Icon from "metabase/components/Icon";

import { color as c, normal as defaultColors } from "metabase/lib/colors";

export default class CheckBox extends Component {
  static propTypes = {
    checked: PropTypes.bool,
    indeterminate: PropTypes.bool,
    onChange: PropTypes.func,
    color: PropTypes.oneOf(Object.keys(defaultColors)),
    size: PropTypes.number, // TODO - this should probably be a concrete set of options
    padding: PropTypes.number, // TODO - the component should pad itself properly based on the size
    noIcon: PropTypes.bool,
  };

  static defaultProps = {
    size: 16,
    padding: 2,
    color: "blue",
    style: {},
  };

  onClick(e) {
    if (this.props.onChange) {
      // TODO: use a proper event object?
      this.props.onChange({
        // add preventDefault so checkboxes can optionally prevent
        preventDefault: () => e.preventDefault(),
        target: { checked: !this.props.checked },
      });
    }
  }

  render() {
    const {
      className,
      style,
      checked,
      indeterminate,
      color,
      padding,
      size,
      noIcon,
    } = this.props;

    const checkedColor = defaultColors[color];
    const uncheckedColor = c("text-light");

    const checkboxStyle = {
      width: size,
      height: size,
      backgroundColor: checked ? checkedColor : "white",
      border: `2px solid ${checked ? checkedColor : uncheckedColor}`,
    };
    return (
      <div
        className={cx(
          className,
          "flex align-center justify-center rounded cursor-pointer",
        )}
        style={{ ...style, ...checkboxStyle }}
        onClick={e => {
          this.onClick(e);
        }}
      >
        {(checked || indeterminate) && !noIcon && (
          <Icon
            style={{ color: checked ? "white" : uncheckedColor }}
            name={indeterminate ? "dash" : "check"}
            size={size - padding * 2}
          />
        )}
      </div>
    );
  }
}
