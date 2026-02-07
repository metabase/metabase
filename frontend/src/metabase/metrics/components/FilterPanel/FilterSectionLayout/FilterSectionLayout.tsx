import type { ReactNode } from "react";
import { t } from "ttag";

import { ActionIcon, Box, FixedSizeIcon, Group, Stack } from "metabase/ui";

type FilterSectionLayoutProps = {
  label: string;
  children?: ReactNode;
  onRemove: () => void;
};

export function FilterSectionLayout({
  label,
  children,
  onRemove,
}: FilterSectionLayoutProps) {
  return (
    <Group
      p="md"
      bdrs="md"
      bg="background-secondary"
      justify="space-between"
      wrap="nowrap"
    >
      <Stack gap="sm">
        <Box c="text-secondary" fz="sm" fw="bold">
          {label}
        </Box>
        {children}
      </Stack>
      <ActionIcon aria-label={t`Remove`} onClick={onRemove}>
        <FixedSizeIcon name="close" />
      </ActionIcon>
    </Group>
  );
}
