import type { ReactNode } from "react";

import { Link } from "metabase/common/components/Link/Link";
import { Center, Group, Icon, Paper, Stack, Text, rem } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./MetadataCard.module.css";

interface MetadataCardProps {
  children: ReactNode;
}

export function MetadataCard({ children }: MetadataCardProps) {
  return (
    <Paper className={S.card}>
      <Stack gap={rem(12)} className={S.rows}>
        {children}
      </Stack>
    </Paper>
  );
}

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

export function MetadataRowLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={S.link}>
      <Text component="span" fw={600} className={S.text}>
        {children}
      </Text>
    </Link>
  );
}
