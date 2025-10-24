import type { ReactNode } from "react";

import { Group, Stack, Text, Title } from "metabase/ui";

type TitleSectionProps = {
  label: string;
  description?: string;
  children?: ReactNode;
};

export function TitleSection({
  label,
  description,
  children,
}: TitleSectionProps) {
  return (
    <Stack>
      <Group>
        <Stack flex={1} gap="sm">
          <Title order={4}>{label}</Title>
          <Text c="text-secondary">{description}</Text>
        </Stack>
      </Group>
      {children}
    </Stack>
  );
}
