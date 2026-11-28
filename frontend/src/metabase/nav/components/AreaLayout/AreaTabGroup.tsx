import type { ReactNode } from "react";

import { Stack, Text, type TextProps } from "metabase/ui";

import S from "./AreaLayout.module.css";

type AreaTabGroupProps = {
  label: string;
  showLabel: boolean;
  children: ReactNode;
  mb?: string;
};

/**
 * The small uppercase heading over a group of nav tabs. PROTOTYPE: exported
 * so the main nav's grouped variants use the same style.
 */
export function AreaTabGroupHeading({
  children,
  ...props
}: TextProps & { children: ReactNode }) {
  return (
    <Text component="h4" className={S.groupHeading} px="sm" {...props}>
      {children}
    </Text>
  );
}

export function AreaTabGroup({
  label,
  showLabel,
  children,
  mb,
}: AreaTabGroupProps) {
  return (
    <Stack component="section" gap="0" mb={mb} aria-label={label}>
      {showLabel && <AreaTabGroupHeading>{label}</AreaTabGroupHeading>}
      {children}
    </Stack>
  );
}
