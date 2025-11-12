import type { ReactNode, Ref } from "react";
import { forwardRef } from "react";
import { t } from "ttag";

import { Box, Flex, type FlexProps, Icon, Text, Tooltip } from "metabase/ui";

export interface FormFieldProps extends FlexProps {
  title?: string;
  actions?: ReactNode;
  description?: ReactNode;
  optional?: boolean;
  error?: string;
  htmlFor?: string;
  infoLabel?: string;
  infoTooltip?: string;
}

export const FormField = forwardRef(function FormField(
  {
    title,
    actions,
    description,
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
    <Flex {...props} ref={ref} direction="column" mb="md">
      {(hasTitle || hasDescription) && (
        <Box>
          <Flex align="center" mb={hasDescription ? "xs" : undefined}>
            {hasTitle && (
              <Text
                component="label"
                c={hasError ? "error" : "text-primary"}
                htmlFor={htmlFor}
                fw="bold"
                fz="md"
              >
                {title}
                {hasError && (
                  <Text component="span" c="error" role="alert">
                    : {error}
                  </Text>
                )}
              </Text>
            )}
            {!!optional && !hasError && (
              <Text
                component="span"
                c={"text-secondary"}
                fw="900"
                fz="sm"
                ml="xs"
              >{t`(optional)`}</Text>
            )}
            {(infoLabel || infoTooltip) && (
              <Tooltip multiline label={infoTooltip}>
                {infoLabel ? (
                  <Text c="text-secondary" mb="sm" fz="md" ml="auto">
                    {infoLabel}
                  </Text>
                ) : (
                  <Icon c="background-tertiary-inverse" ml="sm" name="info" />
                )}
              </Tooltip>
            )}
            {actions && (
              <Box ml="auto" fz="0.75rem" fw="900" c="text-secondary">
                {actions}
              </Box>
            )}
          </Flex>
          {description && (
            <Text c="text-secondary" mb="sm" fz="sm" lh="md">
              {description}
            </Text>
          )}
        </Box>
      )}
      {children}
    </Flex>
  );
});
