import React, { Component } from "react";
import PropTypes from "prop-types";

import cx from "classnames";

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
    title: PropTypes.string,
    description: PropTypes.string,

    children: PropTypes.oneOfType([
      PropTypes.arrayOf(PropTypes.node),
      PropTypes.node,
    ]),
  };

  render() {
    const {
      className,
      formField,
      title = formField && formField.title,
      description = formField && formField.description,
      hidden = formField &&
        (formField.hidden != null
          ? formField.hidden
          : formField.type === "hidden"),
      horizontal = formField &&
        (formField.horizontal != null
          ? formField.horizontal
          : formField.type === "boolean"),
      children,
    } = this.props;

    if (hidden) {
      return null;
    }

    let { name, error, visited, active } = {
      ...(this.props.field || {}),
      ...this.props,
    };

    if (visited === false || active === true) {
      // if the field hasn't been visited or is currently active then don't show the error
      error = null;
    }

    return (
      <div
        className={cx("Form-field", className, {
          "Form--fieldError": !!error,
          flex: horizontal,
        })}
        id={`formField-${name.replace(/\./g, "-")}`}
      >
        {(title || description) && (
          <div>
            {title && (
              <label
                className={cx("Form-label", { "mr-auto": horizontal })}
                htmlFor={name}
                id={`${name}-label`}
              >
                {title} {error && <span className="text-error">: {error}</span>}
              </label>
            )}
            {description && <div className="mb1">{description}</div>}
          </div>
        )}
        <div className={cx("flex-no-shrink", { "ml-auto": horizontal })}>
          {children}
        </div>
      </div>
    );
  }
}
