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
  ...boxProps
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
} & BoxProps) {
  return (
    <Box {...boxProps}>
      {children && (
        <Stack gap="lg" className={S.SettingsSection}>
          {(title || description) && (
            <Box mb="sm">
              {title && <Title order={2}>{title}</Title>}
              {description && <Text c="text-medium">{description}</Text>}
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
            <Text c="text-medium" maw="40rem">
              {description}
            </Text>
          )}
        </Box>
      )}
      {children}
    </Stack>
  );
}
