import type { ReactNode } from "react";

import { Stack, Text } from "metabase/ui";

import S from "./AreaLayout.module.css";

type AreaTabGroupProps = {
  label: string;
  showLabel: boolean;
  children: ReactNode;
  mb?: string;
  /** A group nested in another group, headed in sentence case */
  isSubgroup?: boolean;
};

export function AreaTabGroup({
  label,
  showLabel,
  children,
  mb,
  isSubgroup,
}: AreaTabGroupProps) {
  return (
    <Stack component="section" gap="0" mb={mb} aria-label={label}>
      {showLabel &&
        (isSubgroup ? (
          <Text
            component="h5"
            size="sm"
            fw="bold"
            c="text-secondary"
            px="sm"
            mb="xs"
          >
            {label}
          </Text>
        ) : (
          <Text component="h4" className={S.groupHeading} px="sm">
            {label}
          </Text>
        ))}
      {children}
    </Stack>
  );
}
