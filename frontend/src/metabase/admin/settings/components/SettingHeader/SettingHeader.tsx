import type React from "react";

import type { BoxProps } from "metabase/ui";
import { Box, Text } from "metabase/ui";

export const SettingHeader = ({
  id,
  description,
  title,
  ...boxProps
}: {
  id: string;
  description?: string | React.ReactNode;
  title?: string;
} & BoxProps) => (
  <Box {...boxProps}>
    <SettingTitle id={id}>{title}</SettingTitle>
    {!!description && (
      <Text mb="sm" maw="38rem" lh="xl" c="text-medium">
        {description}
      </Text>
    )}
  </Box>
);

export const SettingTitle = ({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) => (
  <Text
    htmlFor={id}
    component="label"
    c="text-dark"
    fw="bold"
    display="inline-block"
  >
    {children}
  </Text>
);
