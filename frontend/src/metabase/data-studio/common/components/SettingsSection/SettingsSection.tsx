import cx from "classnames";
import type { ReactNode } from "react";

import { Box, Card, Stack, Text, Title } from "metabase/ui";

import S from "./SettingsSection.module.css";

type SettingsSectionProps = {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
};

/** A heading and optional description above the section's settings */
export function SettingsSection({
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <Stack component="section" gap="md">
      <Stack gap="xs">
        <Title order={4}>{title}</Title>
        {description != null && <Text c="text-secondary">{description}</Text>}
      </Stack>
      {children}
    </Stack>
  );
}

/** A bordered card of settings rows, with a divider between rows */
export function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <Card
      className={S.card}
      bg="background_page-primary"
      radius="lg"
      shadow="none"
      px="xl"
      py={0}
    >
      {children}
    </Card>
  );
}

type SettingsRowProps = {
  /** Without one, the content fills the row instead of sitting beside it */
  label?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
};

/**
 * One setting: its label and help text, and its control. Content-only rows
 * that render nothing are hidden, so a setting that doesn't apply leaves no
 * empty row.
 */
export function SettingsRow({
  label,
  description,
  children,
}: SettingsRowProps) {
  if (label == null) {
    return <div className={cx(S.row, S.block)}>{children}</div>;
  }

  return (
    <div className={S.row}>
      <Stack className={S.label} gap="xxs">
        <Text fw="bold">{label}</Text>
        {description != null && (
          <Text size="sm" c="text-secondary">
            {description}
          </Text>
        )}
      </Stack>
      <Box className={S.control}>{children}</Box>
    </div>
  );
}

/** A read-only value, in a row's control position */
export function SettingsValue({ children }: { children: ReactNode }) {
  return <Text ta="right">{children}</Text>;
}
