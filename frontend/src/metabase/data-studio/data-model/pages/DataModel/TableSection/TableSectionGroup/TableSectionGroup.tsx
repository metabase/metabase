import type { ReactNode } from "react";

import { Group, Stack, Title } from "metabase/ui";

import S from "../TableSection.module.css";

export function TableSectionGroup({
  title,
  actions,
  children,
}: {
  title?: string;
  /** Rendered at the right of the title. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack gap="lg" className={S.box}>
      {title && (
        <Group justify="space-between" wrap="nowrap">
          <Title order={4} fz="sm" c="text-secondary">
            {title}
          </Title>
          {actions}
        </Group>
      )}
      {children}
    </Stack>
  );
}
