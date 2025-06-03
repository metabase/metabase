import type React from "react";

import { Box, type BoxProps, Stack, Text, Title } from "metabase/ui";

import S from "./SettingsSection.module.css";

export function SettingSection({
  title,
  description,
  children,
  ...boxProps
}: {
  title?: React.ReactNode,
  description?: React.ReactNode,
  children?: React.ReactNode,
  boxProps?: BoxProps
}) {
  return (
    <Box>
      {(title || description) && (
        <Box mb="sm">
          {title && <Title order={2}>{title}</Title>}
          {description && <Text c="text-medium">{description}</Text>}
        </Box>
      )}
      <Stack gap="lg" className={S.SettingsSection} {...boxProps}>
        {children}
      </Stack>
    </Box>
  );
}