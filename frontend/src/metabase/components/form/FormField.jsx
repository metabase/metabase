import React, { Component } from "react";
import PropTypes from "prop-types";

import cx from "classnames";
import { getIn } from "icepick";

export default class FormField extends Component {
  static propTypes = {
    // redux-form compatible:
    name: PropTypes.string,
    error: PropTypes.any,
    visited: PropTypes.bool,
    active: PropTypes.bool,

    displayName: PropTypes.string,
    children: PropTypes.element,

    // legacy
    fieldName: PropTypes.string,
    formError: PropTypes.object,
  };

  render() {
    const { displayName, offset, formError, children } = this.props;
    const name = this.props.name || this.props.fieldName;

    let error = this.props.error || getIn(formError, ["data", "errors", name]);
    if (this.props.visited === false || this.props.active === true) {
      // if the field hasn't been visited or is currently active then don't show the error
      error = null;
    }

    return (
      <div
        className={cx("Form-field", {
          "Form--fieldError": !!error,
        })}
      >
        {displayName && (
          <label
            className={cx("Form-label", { "Form-offset": offset })}
            htmlFor={name}
          >
            {displayName}{" "}
            {error && <span className="text-error mx1">{error}</span>}
          </label>
        )}
        {children}
      </div>
    );
  }
}
