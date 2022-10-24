import React, { forwardRef, HTMLAttributes, ReactNode, Ref } from "react";
import { FormFieldAlignment, FormFieldOrientation } from "./types";
import {
  FieldCaption,
  FieldDescription,
  FieldLabel,
  FieldLabelError,
  FieldRoot,
} from "./FormField.styled";

export interface FormFieldProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  error?: string;
  touched?: boolean;
  alignment?: FormFieldAlignment;
  orientation?: FormFieldOrientation;
  children?: ReactNode;
}

const FormField = forwardRef(function FormField(
  {
    title,
    description,
    error,
    touched = false,
    alignment = "end",
    orientation = "vertical",
    children,
    ...props
  }: FormFieldProps,
  ref: Ref<HTMLDivElement>,
) {
  const hasError = touched && Boolean(error);

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
          {title && (
            <FieldLabel>
              {title}
              {hasError && <FieldLabelError>: {error}</FieldLabelError>}
            </FieldLabel>
          )}
          {description && <FieldDescription>{description}</FieldDescription>}
        </FieldCaption>
      )}
      {alignment === "end" && children}
    </FieldRoot>
  );
});

export default FormField;
