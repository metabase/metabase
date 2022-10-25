import React, { forwardRef, HTMLAttributes, ReactNode, Ref } from "react";
import { FieldAlignment, FieldOrientation } from "./types";
import {
  FieldCaption,
  FieldDescription,
  FieldLabel,
  FieldLabelError,
  FieldRoot,
} from "./InputField.styled";

export interface InputFieldProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: ReactNode;
  error?: string;
  htmlFor?: string;
  alignment?: FieldAlignment;
  orientation?: FieldOrientation;
  children?: ReactNode;
}

const InputField = forwardRef(function InputField(
  {
    title,
    description,
    error,
    htmlFor,
    alignment = "end",
    orientation = "vertical",
    children,
    ...props
  }: InputFieldProps,
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

export default InputField;
