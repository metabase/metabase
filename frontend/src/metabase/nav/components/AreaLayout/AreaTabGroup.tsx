import type { ReactNode } from "react";

import { Group, Stack, Text } from "metabase/ui";

import S from "./AreaLayout.module.css";

type AreaTabGroupProps = {
  label: string;
  showLabel: boolean;
  children: ReactNode;
  rightSection?: ReactNode;
  mb?: string;
};

export function AreaTabGroup({
  label,
  showLabel,
  children,
  rightSection,
  mb,
}: AreaTabGroupProps) {
  return (
    <Stack component="section" gap="0.75rem" mb={mb} aria-label={label}>
      {showLabel && (
        <Group justify="space-between" wrap="nowrap" px="sm">
          <Text component="h4" className={S.groupHeading}>
            {label}
          </Text>
          {rightSection}
        </Group>
      )}
      {children}
    </Stack>
  );
}
