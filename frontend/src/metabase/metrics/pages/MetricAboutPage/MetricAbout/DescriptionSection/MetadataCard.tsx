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
  to?: string;
  children: ReactNode;
}

export function MetadataRow({ icon, to, children }: MetadataRowProps) {
  const body = (
    <Group gap={rem(10)} wrap="nowrap" align="center">
      <Center
        bg="background-primary"
        w={rem(24)}
        h={rem(24)}
        className={S.iconCircle}
      >
        <Icon
          name={icon}
          size={12}
          c={to ? "text-primary" : "text-secondary"}
        />
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
