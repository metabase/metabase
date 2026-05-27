import type { ReactNode } from "react";

import { Link } from "metabase/common/components/Link/Link";
import { Center, Group, Icon, Paper, Stack, Text, rem } from "metabase/ui";
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
  const body = (
    <Group gap="sm" wrap="nowrap" align="center">
      <Center
        bg="background-primary"
        w={rem(28)}
        h={rem(28)}
        style={{ borderRadius: "100%", flexShrink: 0 }}
      >
        <Icon name={icon} c={to ? "text-primary" : "text-secondary"} />
      </Center>
      <Text
        component="span"
        c={to ? "brand" : "text-secondary"}
        fw={to ? 600 : 400}
      >
        {children}
      </Text>
    </Group>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
