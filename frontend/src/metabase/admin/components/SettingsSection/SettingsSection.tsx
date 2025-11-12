import type React from "react";

import {
  Box,
  type BoxProps,
  Stack,
  type StackProps,
  Text,
  Title,
} from "metabase/ui";

import S from "./SettingsSection.module.css";

export function SettingsSection({
  title,
  description,
  children,
  stackProps,
  ...boxProps
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  stackProps?: StackProps;
} & BoxProps) {
  return (
    <Box {...boxProps}>
      {children && (
        <Stack gap="lg" className={S.SettingsSection} {...stackProps}>
          {(title || description) && (
            <Box mb="sm">
              {title && <Title order={2}>{title}</Title>}
              {description && <Text c="text-secondary">{description}</Text>}
            </Box>
          )}
          {children}
        </Stack>
      )}
    </Box>
  );
}

export function SettingsPageWrapper({
  title,
  description,
  children,
  ...stackProps
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
} & StackProps) {
  return (
    <Stack gap="lg" {...stackProps}>
      {(title || description) && (
        <Box>
          {title && <Title order={1}>{title}</Title>}
          {description && (
            <Text c="text-secondary" maw="40rem">
              {description}
            </Text>
          )}
        </Box>
      )}
      {children}
    </Stack>
  );
}
