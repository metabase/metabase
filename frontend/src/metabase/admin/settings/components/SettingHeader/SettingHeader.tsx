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
    <Text my="sm" maw="38rem" lh="xl" c="text-medium">
      {description}
    </Text>
  </Box>
);

export const SettingTitle = ({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) => (
  <Text
    htmlFor={id}
    component="label"
    c="text-medium"
    fw="bold"
    tt="uppercase"
    display="block"
  >
    {children}
  </Text>
);
