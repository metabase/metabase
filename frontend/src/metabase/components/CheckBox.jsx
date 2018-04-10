import React, { Component } from "react";
import PropTypes from "prop-types";
import Icon from "metabase/components/Icon";

import { normal as defaultColors } from "metabase/lib/colors";

export default class CheckBox extends Component {
  static propTypes = {
    checked: PropTypes.bool,
    onChange: PropTypes.func,
    color: PropTypes.oneOf(Object.keys(defaultColors)),
    size: PropTypes.number, // TODO - this should probably be a concrete set of options
    padding: PropTypes.number, // TODO - the component should pad itself properly based on the size
  };

  static defaultProps = {
    size: 16,
    padding: 2,
    color: "blue",
  };

  onClick() {
    if (this.props.onChange) {
      // TODO: use a proper event object?
      this.props.onChange({ target: { checked: !this.props.checked } });
    }
  }

  render() {
    const { checked, color, padding, size } = this.props;

    const themeColor = defaultColors[color];

    const checkboxStyle = {
      width: size,
      height: size,
      backgroundColor: checked ? themeColor : "white",
      border: `2px solid ${checked ? themeColor : "#ddd"}`,
    };
    return (
      <div className="cursor-pointer" onClick={() => this.onClick()}>
        <div
          style={checkboxStyle}
          className="flex align-center justify-center rounded"
        >
          {checked && (
            <Icon
              style={{ color: checked ? "white" : themeColor }}
              name="check"
              size={size - padding * 2}
            />
          )}
        </div>
      </div>
    );
  }
}
