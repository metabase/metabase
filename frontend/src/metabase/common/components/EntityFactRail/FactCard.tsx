import type { ReactNode } from "react";

import { Link } from "metabase/common/components/Link/Link";
import { Center, Group, Icon, Paper, Stack, Text, rem } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./FactCard.module.css";

export interface FactCardProps {
  children: ReactNode;
}

export function FactCard({ children }: FactCardProps) {
  return (
    <Paper className={S.card}>
      <Stack gap={rem(12)} className={S.rows}>
        {children}
      </Stack>
    </Paper>
  );
}

export interface FactRowProps {
  icon: IconName;
  children: ReactNode;
  /** Empty-state styling: muted icon and text. */
  muted?: boolean;
}

export function FactRow({ icon, children, muted }: FactRowProps) {
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

export interface FactRowLinkProps {
  to: string;
  children: ReactNode;
}

export function FactRowLink({ to, children }: FactRowLinkProps) {
  return (
    <Link to={to} className={S.link}>
      <Text component="span" fw={600} className={S.text}>
        {children}
      </Text>
    </Link>
  );
}
