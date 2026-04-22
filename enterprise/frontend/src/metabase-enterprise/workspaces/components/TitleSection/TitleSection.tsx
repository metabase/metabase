import type { ReactNode } from "react";

import { Card, Group, Stack, Text, Title } from "metabase/ui";

type TitleSectionProps = {
  label: string;
  description?: ReactNode;
  rightSection?: ReactNode;
  children?: ReactNode;
};

export function TitleSection({
  label,
  description,
  rightSection,
  children,
}: TitleSectionProps) {
  return (
    <Stack>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack flex={1} gap="sm">
          <Title order={4}>{label}</Title>
          <Text c="text-secondary">{description}</Text>
        </Stack>
        {rightSection}
      </Group>
      <Card p={0} shadow="none" withBorder>
        {children}
      </Card>
    </Stack>
  );
}
