import React, { forwardRef, HTMLAttributes, ReactNode, Ref } from "react";
import Tooltip from "metabase/components/Tooltip";
import { FieldAlignment, FieldOrientation } from "./types";
import {
  FieldCaption,
  FieldDescription,
  FieldInfoIcon,
  FieldInfoLabel,
  FieldLabel,
  FieldLabelContainer,
  FieldLabelError,
  FieldRoot,
} from "./FormField.styled";

export interface FormFieldProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: ReactNode;
  alignment?: FieldAlignment;
  orientation?: FieldOrientation;
  error?: string;
  htmlFor?: string;
  infoLabel?: string;
  infoTooltip?: string;
}

const FormField = forwardRef(function FormField(
  {
    title,
    description,
    alignment = "end",
    orientation = "vertical",
    error,
    htmlFor,
    infoLabel,
    infoTooltip,
    children,
    ...props
  }: FormFieldProps,
  ref: Ref<HTMLDivElement>,
) {
  const hasError = Boolean(error);

  return (
    <FieldRoot
      {...props}
      ref={ref}
      orientation={orientation}
      hasError={hasError}
    >
      {alignment === "start" && children}
      {(title || description) && (
        <FieldCaption alignment={alignment} orientation={orientation}>
          <FieldLabelContainer>
            {title && (
              <FieldLabel htmlFor={htmlFor}>
                {title}
                {hasError && <FieldLabelError>: {error}</FieldLabelError>}
              </FieldLabel>
            )}
            {(infoLabel || infoTooltip) && (
              <Tooltip tooltip={infoTooltip} maxWidth="100%">
                {infoLabel ? (
                  <FieldInfoLabel>{infoLabel}</FieldInfoLabel>
                ) : (
                  <FieldInfoIcon name="info" />
                )}
              </Tooltip>
            )}
          </FieldLabelContainer>
          {description && <FieldDescription>{description}</FieldDescription>}
        </FieldCaption>
      )}
      {alignment === "end" && children}
    </FieldRoot>
  );
});

export default FormField;
