import React, { forwardRef, HTMLAttributes, ReactNode, Ref } from "react";
import { t } from "ttag";
import Tooltip from "metabase/core/components/Tooltip";
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
  OptionalTag,
} from "./FormField.styled";

export interface FormFieldProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: ReactNode;
  alignment?: FieldAlignment;
  orientation?: FieldOrientation;
  optional?: boolean;
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
    optional,
    ...props
  }: FormFieldProps,
  ref: Ref<HTMLDivElement>,
) {
  const hasTitle = Boolean(title);
  const hasDescription = Boolean(description);
  const hasError = Boolean(error);

  return (
    <FieldRoot
      {...props}
      ref={ref}
      alignment={alignment}
      orientation={orientation}
    >
      {alignment === "start" && children}
      {(hasTitle || hasDescription) && (
        <FieldCaption
          alignment={alignment}
          orientation={orientation}
          hasDescription={hasDescription}
        >
          <FieldLabelContainer
            orientation={orientation}
            hasDescription={hasDescription}
          >
            {hasTitle && (
              <FieldLabel hasError={hasError} htmlFor={htmlFor}>
                {title}
                {hasError && <FieldLabelError>: {error}</FieldLabelError>}
              </FieldLabel>
            )}
            {!!optional && !hasError && (
              <OptionalTag>{t`(optional)`}</OptionalTag>
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

export default Object.assign(FormField, {
  Root: FieldRoot,
  Label: FieldLabel,
});
