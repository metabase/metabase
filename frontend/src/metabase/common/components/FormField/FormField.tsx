import cx from "classnames";
import type { HTMLAttributes, ReactNode, Ref } from "react";
import { forwardRef } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Box, Flex, Icon, Text, Tooltip } from "metabase/ui";

import S from "./FormField.module.css";
import type { FieldAlignment, FieldOrientation } from "./types";

export interface FormFieldProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  actions?: ReactNode;
  description?: ReactNode;
  alignment?: FieldAlignment;
  orientation?: FieldOrientation;
  optional?: boolean;
  error?: string;
  htmlFor?: string;
  infoLabel?: string;
  infoTooltip?: string;
}

type FieldLabelContainerProps = {
  orientation: FieldOrientation;
  hasDescription: boolean;
  children?: ReactNode;
};

const FieldLabelContainer = ({
  orientation,
  hasDescription,
  children,
}: FieldLabelContainerProps) => (
  <Flex
    align="center"
    mb={orientation === "vertical" || hasDescription ? "xs" : undefined}
  >
    {children}
  </Flex>
);

type FieldLabelProps = {
  hasError: boolean;
  htmlFor?: string;
  children?: ReactNode;
};

const FieldLabel = ({ hasError, htmlFor, children }: FieldLabelProps) => (
  <Box
    component="label"
    className={cx(S.label, { [S.invalid]: hasError })}
    htmlFor={htmlFor}
    fz="sm"
    fw={900}
  >
    {children}
  </Box>
);

const FormFieldInner = forwardRef(function FormField(
  {
    title,
    actions,
    description,
    alignment = "end",
    orientation = "vertical",
    error,
    htmlFor,
    infoLabel,
    infoTooltip,
    children,
    optional,
    className,
    ...props
  }: FormFieldProps,
  ref: Ref<HTMLDivElement>,
) {
  const hasTitle = Boolean(title);
  const hasDescription = Boolean(description);
  const hasError = Boolean(error);
  const isHorizontal = orientation === "horizontal";

  return (
    <Box
      {...props}
      ref={ref}
      className={cx(
        S.root,
        {
          [CS.flex]: isHorizontal,
          [CS.justifyBetween]: isHorizontal && alignment === "end",
        },
        className,
      )}
    >
      {alignment === "start" && children}
      {(hasTitle || hasDescription) && (
        <Box
          className={cx({ [S.selfCenter]: isHorizontal && !hasDescription })}
          ml={isHorizontal && alignment === "start" ? "sm" : undefined}
          mr={isHorizontal && alignment === "end" ? "sm" : undefined}
        >
          <FieldLabelContainer
            orientation={orientation}
            hasDescription={hasDescription}
          >
            {hasTitle && (
              <FieldLabel hasError={hasError} htmlFor={htmlFor}>
                {title}
                {hasError && (
                  <Text
                    component="span"
                    className={S.labelError}
                    inherit
                    lh="inherit"
                    c="feedback-negative"
                    role="alert"
                  >
                    : {error}
                  </Text>
                )}
              </FieldLabel>
            )}
            {!!optional && !hasError && (
              <Text
                component="span"
                c="text-secondary"
                fz="sm"
                fw={900}
                lh="md"
                ml="xxs"
              >{t`(optional)`}</Text>
            )}
            {(infoLabel || infoTooltip) && (
              <Tooltip multiline label={infoTooltip}>
                {infoLabel ? (
                  <Text
                    className={CS.cursorDefault}
                    c="text-secondary"
                    fz="sm"
                    lh="md"
                    ml="auto"
                  >
                    {infoLabel}
                  </Text>
                ) : (
                  <Icon className={S.infoIcon} name="info" size={12} ml="sm" />
                )}
              </Tooltip>
            )}
            {actions && (
              <Text c="text-secondary" fz="sm" fw={900} lh="md" ml="auto">
                {actions}
              </Text>
            )}
          </FieldLabelContainer>
          {description && (
            <Text c="text-secondary" lh="md" mb="sm">
              {description}
            </Text>
          )}
        </Box>
      )}
      {alignment === "end" && children}
    </Box>
  );
});

export const FormField = Object.assign(FormFieldInner, {
  Label: FieldLabel,
  LabelContainer: FieldLabelContainer,
});
