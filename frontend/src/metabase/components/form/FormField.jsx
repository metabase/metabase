import React, { Component } from "react";
import PropTypes from "prop-types";

import cx from "classnames";
import { getIn } from "icepick";

export default class FormField extends Component {
  static propTypes = {
    field: PropTypes.object,
    formField: PropTypes.object,

    // redux-form compatible:
    name: PropTypes.string,
    error: PropTypes.any,
    visited: PropTypes.bool,
    active: PropTypes.bool,

    hidden: PropTypes.bool,
    displayName: PropTypes.string,

    children: PropTypes.oneOfType([
      PropTypes.arrayOf(PropTypes.node),
      PropTypes.node,
    ]),

    // legacy
    fieldName: PropTypes.string,
    formError: PropTypes.object,
  };

  render() {
    const {
      formField,
      displayName = formField &&
        (formField.title || formField.name.split(".").pop()),
      hidden = formField && formField.type === "hidden",
      horizontal = formField && formField.horizontal,
      children,
    } = this.props;

    let { name, error, visited, active } = {
      ...{
        // legacy
        name: this.props.fieldName,
        error: getIn(this.props.formError, ["data", "errors", name]),
      },
      ...(this.props.field || {}),
      ...this.props,
    };

    if (visited === false || active === true) {
      // if the field hasn't been visited or is currently active then don't show the error
      error = null;
    }

    return (
      <div
        className={cx("Form-field", {
          "Form--fieldError": !!error,
          hide: hidden,
          flex: horizontal,
        })}
      >
        {horizontal ? children : null}
        {displayName && (
          <label
            className={cx("Form-label", { ml1: horizontal })}
            htmlFor={name}
          >
            {displayName}{" "}
            {error && <span className="text-error">: {error}</span>}
          </label>
        )}
        {horizontal ? null : children}
      </div>
    );
  }
}
