import cx from "classnames";
import type React from "react";

import {
  Box,
  type BoxProps,
  Stack,
  type StackProps,
  Text,
  type TextProps,
  Title,
  type TitleProps,
} from "metabase/ui";

import S from "./SettingsSection.module.css";

// Card titles render h4-sized but stay h2 so the page outline doesn't jump
// from the h1 page title to h4.
export const SETTINGS_CARD_TITLE_PROPS: TitleProps = { order: 2, size: "h4" };
export const SETTINGS_CARD_DESCRIPTION_PROPS: TextProps = {
  lh: "sm",
  mt: "xxs",
};
export const SETTINGS_CARD_STACK_PROPS: StackProps = { gap: "lg" };

export function SettingsSection({
  title,
  titleProps,
  description,
  descriptionProps,
  children,
  id,
  stackProps,
  disabled = false,
  className,
  ...boxProps
}: {
  title?: React.ReactNode;
  titleProps?: TitleProps;
  description?: React.ReactNode;
  descriptionProps?: TextProps;
  children?: React.ReactNode;
  id?: string;
  stackProps?: StackProps;
  // greys the whole card out; the caller still disables the controls inside
  disabled?: boolean;
} & BoxProps) {
  const { className: stackClassName, ...restStackProps } = stackProps ?? {};
  return (
    <Box
      id={id}
      className={cx(disabled && S.DisabledSection, className)}
      {...boxProps}
    >
      {children && (
        <Stack
          gap="xl"
          className={cx(S.SettingsSection, stackClassName)}
          {...restStackProps}
        >
          {(title || description) && (
            <Box mb="sm">
              {title && (
                <Title order={2} {...titleProps}>
                  {title}
                </Title>
              )}
              {description && (
                <Text c="text-secondary" {...descriptionProps}>
                  {description}
                </Text>
              )}
            </Box>
          )}
          {children}
        </Stack>
      )}
    </Box>
  );
}
