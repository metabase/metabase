import type { ReactNode } from "react";

import { Link } from "metabase/common/components/Link/Link";
import { Group, Icon, Paper, Stack, Text, rem } from "metabase/ui";
import type { IconName } from "metabase-types/api";

interface MetadataCardProps {
  children: ReactNode;
}

export function MetadataCard({ children }: MetadataCardProps) {
  return (
    <Paper bg="background-secondary" radius={rem(16)} p="md">
      <Stack gap="sm">{children}</Stack>
    </Paper>
  );
}

interface MetadataRowProps {
  icon: IconName;
  to?: string;
  children: ReactNode;
}

export function MetadataRow({ icon, to, children }: MetadataRowProps) {
  const color = to ? "brand" : "text-secondary";
  const body = (
    <Group gap="sm" wrap="nowrap">
      <Icon name={icon} c={color} />
      <Text component="span" c={color} fw={to ? 600 : 400}>
        {children}
      </Text>
    </Group>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
