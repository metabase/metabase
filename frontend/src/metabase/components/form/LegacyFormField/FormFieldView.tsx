import React from "react";
import cx from "classnames";

import Tooltip from "metabase/components/Tooltip";

import { BaseFieldDefinition } from "metabase-types/forms";

import { FormFieldDescription } from "./FormFieldDescription";
import {
  FieldRow,
  Label,
  InfoIcon,
  InputContainer,
  FieldContainer,
  InfoLabel,
} from "./FormField.styled";

interface FormFieldViewProps extends BaseFieldDefinition {
  fieldId: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

function FormFieldView({
  fieldId,
  className,
  name,
  error,
  title,
  description,
  descriptionPosition,
  info,
  infoLabel,
  infoLabelTooltip,
  align,
  horizontal,
  children,
}: FormFieldViewProps) {
  const rootClassNames = cx("Form-field", className, {
    "Form--fieldError": !!error,
    flex: horizontal,
  });

  return (
    <div id={fieldId} className={rootClassNames}>
      {align === "left" && <InputContainer>{children}</InputContainer>}
      {(title || description) && (
        <FieldContainer horizontal={horizontal} align={align}>
          <FieldRow>
            {title && (
              <Label
                id={`${name}-label`}
                htmlFor={name}
                horizontal={horizontal}
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

export default FormFieldView;
