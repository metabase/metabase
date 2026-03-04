import type React from "react";

import type { BoxProps, TextProps } from "metabase/ui";
import { Box, Text } from "metabase/ui";

export const SettingHeader = ({
  id,
  description,
  title,
  titleProps,
  ...boxProps
}: {
  id: string;
  description?: string | React.ReactNode;
  title?: string;
  titleProps?: TextProps;
} & BoxProps) => (
  <Box {...boxProps}>
    <SettingTitle {...titleProps} id={id}>
      {title}
    </SettingTitle>
    {!!description && (
      <Text mb="sm" maw="38rem" lh="xl" c="text-secondary">
        {description}
      </Text>
    )}
  </Box>
);

export const SettingTitle = ({
  id,
  children,
  ...props
}: TextProps & {
  id?: string;
  children?: React.ReactNode;
}) => (
  <Text
    htmlFor={id}
    component="label"
    c="text-primary"
    fw="bold"
    display="inline-block"
    {...props}
  >
    {children}
  </Text>
);
