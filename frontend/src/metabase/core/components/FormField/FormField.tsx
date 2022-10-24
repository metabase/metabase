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
  children?: ReactNode;
}

const FormField = forwardRef(function FormField(
  { name, title, description, error, children, ...props }: FormFieldProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <FieldRoot {...props} ref={ref} error={error}>
      {(title || description) && (
        <FieldCaption>
          {title && (
            <FieldLabel>
              {title}
              {error && <FieldLabelError>: ${error}</FieldLabelError>}
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
