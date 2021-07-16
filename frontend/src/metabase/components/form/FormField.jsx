import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import Tooltip from "metabase/components/Tooltip";

import { FieldRow, Label, InfoIcon } from "./FormField.styled";

const formFieldCommon = {
  title: PropTypes.string,
  description: PropTypes.string,
  info: PropTypes.string,
  hidden: PropTypes.bool,
  horizontal: PropTypes.bool,
};

const propTypes = {
  ...formFieldCommon,

  field: PropTypes.object,
  formField: PropTypes.shape({
    ...formFieldCommon,
    type: PropTypes.string,
  }),

  // redux-form compatible:
  name: PropTypes.string,
  error: PropTypes.any,
  visited: PropTypes.bool,
  active: PropTypes.bool,

  children: PropTypes.oneOfType([
    PropTypes.arrayOf(PropTypes.node),
    PropTypes.node,
  ]),
  className: PropTypes.string,
};

function FormField(props) {
  const {
    className,
    formField,
    title = formField && formField.title,
    description = formField && formField.description,
    info = formField && formField.info,
    hidden = formField && (formField.hidden || formField.type === "hidden"),
    horizontal = formField &&
      (formField.horizontal || formField.type === "boolean"),
    children,
  } = props;

  if (hidden) {
    return null;
  }

  let { name, error, visited, active } = {
    ...(props.field || {}),
    ...props,
  };

  if (!visited || active) {
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
          <FieldRow>
            {title && (
              <Label
                className={cx("Form-label", { "mr-auto": horizontal })}
                htmlFor={name}
                id={`${name}-label`}
              >
                {title}
                {error && <span className="text-error">: {error}</span>}
              </Label>
            )}
            {info && (
              <Tooltip tooltip={info}>
                <InfoIcon />
              </Tooltip>
            )}
          </FieldRow>
          {description && <div className="mb1">{description}</div>}
        </div>
      )}
      <div className={cx("flex-no-shrink", { "ml-auto": horizontal })}>
        {children}
      </div>
    </div>
  );
}

FormField.propTypes = propTypes;

export default FormField;
