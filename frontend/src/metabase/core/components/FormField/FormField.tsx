import React, { forwardRef, HTMLAttributes, ReactNode, Ref } from "react";
import { FieldAlignment, FieldOrientation } from "./types";
import {
  FieldCaption,
  FieldDescription,
  FieldLabel,
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
}

const FormField = forwardRef(function FormField(
  {
    title,
    description,
    error,
    htmlFor,
    alignment = "end",
    orientation = "vertical",
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
          {title && (
            <FieldLabel htmlFor={htmlFor}>
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
