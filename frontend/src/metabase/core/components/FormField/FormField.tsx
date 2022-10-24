import React, { forwardRef, HTMLAttributes, ReactNode, Ref } from "react";
import {
  FieldCaption,
  FieldDescription,
  FieldLabel,
  FieldLabelError,
  FieldRoot,
} from "./FormField.styled";

export interface FormFieldProps extends HTMLAttributes<HTMLDivElement> {
  name?: string;
  title?: string;
  description?: string;
  error?: string;
  touched?: boolean;
  children?: ReactNode;
}

const FormField = forwardRef(function FormField(
  {
    name,
    title,
    description,
    error,
    touched,
    children,
    ...props
  }: FormFieldProps,
  ref: Ref<HTMLDivElement>,
) {
  const hasError = touched && Boolean(error);

  return (
    <FieldRoot {...props} ref={ref} hasError={hasError}>
      {(title || description) && (
        <FieldCaption>
          {title && (
            <FieldLabel>
              {title}
              {hasError && <FieldLabelError>: {error}</FieldLabelError>}
            </FieldLabel>
          )}
          {description && <FieldDescription>{description}</FieldDescription>}
        </FieldCaption>
      )}
      {children}
    </FieldRoot>
  );
});

export default FormField;
