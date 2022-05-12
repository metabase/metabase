import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import Tooltip from "metabase/components/Tooltip";

import {
  FieldRow,
  Label,
  InfoIcon,
  InputContainer,
  FieldContainer,
  InfoLabel,
} from "./FormField.styled";
import { FormFieldDescription } from "./FormFieldDescription";

const formFieldCommon = {
  title: PropTypes.string,
  description: PropTypes.string,
  descriptionPosition: PropTypes.oneOf(["top", "bottom"]),
  info: PropTypes.string,
  hidden: PropTypes.bool,
  horizontal: PropTypes.bool,
};

const propTypes = {
  ...formFieldCommon,

  field: PropTypes.object,
  formField: PropTypes.shape({
    ...formFieldCommon,
    type: PropTypes.oneOfType([PropTypes.string, PropTypes.func]),
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

const ALL_DOT_CHARS = /\./g;

function FormField(props) {
  const {
    className,
    formField,
    title = formField && formField.title,
    description = formField && formField.description,
    descriptionPosition = descriptionPosition ||
      (formField && formField.descriptionPosition) ||
      "top",
    info = formField && formField.info,
    infoLabel = formField && formField.infoLabel,
    infoLabelTooltip = formField && formField.infoLabelTooltip,
    hidden = formField && (formField.hidden || formField.type === "hidden"),
    horizontal = formField &&
      (formField.horizontal || formField.type === "boolean"),
    align = formField?.align || "right",
    children,
  } = props;

  if (hidden) {
    return null;
  }

  let { name, error, visited, active } = {
    ...(props.field || {}),
    ...props,
  };

  const formFieldId = `formField-${name.replace(ALL_DOT_CHARS, "-")}`;
  const isToggle = formField?.type === "boolean";

  if (!visited || active) {
    // if the field hasn't been visited or is currently active then don't show the error
    error = null;
  }

  const rootClassNames = cx("Form-field", className, {
    "Form--fieldError": !!error,
    flex: horizontal,
  });

  return (
    <div id={formFieldId} className={rootClassNames}>
      {align === "left" && <InputContainer>{children}</InputContainer>}
      {(title || description) && (
        <FieldContainer horizontal={horizontal} align={align}>
          <FieldRow>
            {title && (
              <Label
                id={`${name}-label`}
                htmlFor={name}
                horizontal={horizontal}
                standAlone={isToggle && align === "right" && !description}
              >
                {title}
                {error && <span className="text-error">: {error}</span>}
              </Label>
            )}
            {info && (
              <Tooltip tooltip={info}>
                <InfoIcon name="info" size={12} />
              </Tooltip>
            )}
            {infoLabel && (
              <Tooltip tooltip={infoLabelTooltip} maxWidth="100%">
                <InfoLabel>{infoLabel}</InfoLabel>
              </Tooltip>
            )}
          </FieldRow>
          {description && descriptionPosition === "top" && (
            <FormFieldDescription className="mb1" description={description} />
          )}
        </FieldContainer>
      )}
      {align !== "left" && <InputContainer>{children}</InputContainer>}
      {description && descriptionPosition === "bottom" && (
        <FormFieldDescription className="mt1" description={description} />
      )}
    </div>
  );
}

FormField.propTypes = propTypes;

export default FormField;
