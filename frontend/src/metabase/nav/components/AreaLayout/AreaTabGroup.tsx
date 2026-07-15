import type { ReactNode } from "react";

import { Stack, Text } from "metabase/ui";

import S from "./AreaLayout.module.css";

type AreaTabGroupProps = {
  label: string;
  showLabel: boolean;
  children: ReactNode;
};

export function AreaTabGroup({
  label,
  showLabel,
  children,
}: AreaTabGroupProps) {
  return (
    <Stack component="section" gap="0.75rem" aria-label={label}>
      {showLabel && (
        <Text component="h4" className={S.groupHeading} px="sm">
          {label}
        </Text>
      )}
      {children}
    </Stack>
  );
}
