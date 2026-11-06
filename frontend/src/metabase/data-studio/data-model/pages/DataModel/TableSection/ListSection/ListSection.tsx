import type { ReactNode } from "react";

import { Group, Stack, Text, rem } from "metabase/ui";

/** A titled list of cards on the Segments and Measures tabs */
export function ListSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  /** Sits at the end of the title row */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={0}>
          <Text fw="bold">{title}</Text>
          {description && (
            <Text size="sm" c="text-secondary">
              {description}
            </Text>
          )}
        </Stack>
        {action}
      </Group>
      <Stack gap={rem(12)} role="list">
        {children}
      </Stack>
    </Stack>
  );
}
