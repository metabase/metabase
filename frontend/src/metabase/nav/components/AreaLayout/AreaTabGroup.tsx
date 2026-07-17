import type { ReactNode } from "react";

import { Stack, Text } from "metabase/ui";

import S from "./AreaLayout.module.css";

type AreaTabGroupProps = {
  label: string;
  showLabel: boolean;
  children: ReactNode;
  mb?: string;
};

export function AreaTabGroup({
  label,
  showLabel,
  children,
  mb,
}: AreaTabGroupProps) {
  return (
    <Stack component="section" gap="0.75rem" mb={mb} aria-label={label}>
      {showLabel && (
        <Text component="h4" className={S.groupHeading} px="sm">
          {label}
        </Text>
      )}
      {children}
    </Stack>
  );
}
