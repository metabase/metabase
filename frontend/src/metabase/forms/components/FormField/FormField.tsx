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
  const hasInput = Boolean(children);
  const labelGap = hasDescription ? "xxxs" : "xs";

  return (
    <Flex {...props} ref={ref} direction="column">
      {(hasTitle || hasDescription) && (
        <Box>
          {/* Same spacing under the label as the metabase/ui input label; none when nothing
              follows it. lh="md" is 122%, so the row's line height is fixed in px from fz="md"
              and the smaller "(optional)" inherits that same height. */}
          <Flex
            align="center"
            fz="md"
            lh="md"
            mb={hasDescription || hasInput ? labelGap : undefined}
          >
            {hasTitle && (
              <Text
                component="label"
                c={hasError ? "feedback-negative" : "text-primary"}
                htmlFor={htmlFor}
                fw="bold"
                fz="md"
                lh="md"
              >
                {title}
                {hasError && (
                  <Text
                    component="span"
                    c="feedback-negative"
                    lh="md"
                    role="alert"
                  >
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
                lh="inherit"
                ml="xxs"
              >{t`(optional)`}</Text>
            )}
            {(infoLabel || infoTooltip) && (
              <Tooltip multiline label={infoTooltip}>
                {infoLabel ? (
                  <Text c="text-secondary" fz="md" lh="md" ml="auto">
                    {infoLabel}
                  </Text>
                ) : (
                  <Icon
                    c="background_page-tertiary-inverse"
                    ml="sm"
                    name="info"
                  />
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
