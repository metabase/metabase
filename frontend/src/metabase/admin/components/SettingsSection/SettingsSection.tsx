import type React from "react";

import CS from "metabase/css/core/index.css";
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

export function SettingsSection({
  title,
  titleProps,
  description,
  children,
  id,
  stackProps,
  ...boxProps
}: {
  title?: React.ReactNode;
  titleProps?: TitleProps;
  description?: React.ReactNode;
  children?: React.ReactNode;
  id?: string;
  stackProps?: StackProps;
} & BoxProps) {
  return (
    <Box id={id} {...boxProps}>
      {children && (
        <Stack gap="xl" className={S.SettingsSection} {...stackProps}>
          {(title || description) && (
            <Box mb="sm">
              {title && (
                <Title order={2} {...titleProps}>
                  {title}
                </Title>
              )}
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
            <Title order={1} display="flex" className={CS.alignCenter}>
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
