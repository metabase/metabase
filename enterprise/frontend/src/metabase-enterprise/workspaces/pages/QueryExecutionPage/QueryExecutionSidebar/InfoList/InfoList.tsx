import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import { Box, Card, Group, Stack } from "metabase/ui";

import S from "./InfoList.module.css";

type InfoListProps = {
  "aria-label"?: string;
  children: ReactNode;
};

export function InfoList({ children, ...rest }: InfoListProps) {
  return (
    <Card p={0} shadow="none" withBorder role="region" {...rest}>
      {children}
    </Card>
  );
}

type InfoListItemProps = {
  label: string;
  children?: ReactNode;
};

export function InfoListItem({ label, children }: InfoListItemProps) {
  return (
    <Stack className={S.item} p="md" gap="xs">
      <Box className={CS.textWrap} c="text-secondary" fz="sm" lh="h5">
        {label}
      </Box>
      <Group lh="h4" justify="space-between" wrap="nowrap">
        {children}
      </Group>
    </Stack>
  );
}
