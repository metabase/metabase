import type { ReactNode } from "react";

import { Center, Group, Icon, Text, rem } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./MetadataRow.module.css";

interface MetadataRowProps {
  icon: IconName;
  children: ReactNode;
  /** Empty-state styling: muted icon and text. */
  muted?: boolean;
}

export function MetadataRow({ icon, children, muted }: MetadataRowProps) {
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
      <Text component="span" c={color}>
        {children}
      </Text>
    </Group>
  );
}
