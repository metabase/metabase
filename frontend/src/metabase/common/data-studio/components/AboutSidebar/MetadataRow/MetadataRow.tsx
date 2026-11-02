import type { ReactNode } from "react";

import { Center, Group, Icon, Text, rem } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./MetadataRow.module.css";

interface MetadataRowProps {
  icon: IconName;
  children: ReactNode;
  /** Empty-state styling: muted icon and text. */
  muted?: boolean;
  /** Shown at the end of the row, beside the value even when it wraps. */
  rightSection?: ReactNode;
}

export function MetadataRow({
  icon,
  children,
  muted,
  rightSection,
}: MetadataRowProps) {
  const color = muted ? "text-secondary" : "text-primary";
  return (
    <Group gap={rem(10)} wrap="nowrap" align="center">
      <Center
        bg="background_page-primary"
        w={rem(24)}
        h={rem(24)}
        className={S.iconCircle}
      >
        <Icon name={icon} size={12} c={color} />
      </Center>
      <Text component="span" c={color} className={S.text}>
        {children}
      </Text>
      {rightSection}
    </Group>
  );
}
