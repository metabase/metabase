import type React from "react";

import {
  Stack,
  type StackProps,
  Text,
  type TextProps,
  Title,
} from "metabase/ui";

import S from "./SettingsSection.module.css";

export function SettingsPageWrapper({
  title,
  description,
  descriptionProps,
  children,
  ...stackProps
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  descriptionProps?: TextProps;
  children: React.ReactNode;
} & Omit<StackProps, "title">) {
  return (
    <Stack gap="xl" {...stackProps}>
      {(title || description) && (
        <Stack gap="sm">
          {title && (
            <Title order={1} display="flex" className={S.PageTitle}>
              {title}
            </Title>
          )}
          {description && (
            <Text c="text-secondary" lh={1.5} maw="40rem" {...descriptionProps}>
              {description}
            </Text>
          )}
        </Stack>
      )}
      {children}
    </Stack>
  );
}
