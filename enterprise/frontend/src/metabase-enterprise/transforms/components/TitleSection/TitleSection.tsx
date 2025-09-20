import type { ReactNode } from "react";

import { Group, Stack, Text, Title } from "metabase/ui";

type TitleSectionProps = {
  label: string;
  description?: string;
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
      <Group>
        <Stack flex={1}>
          <Title order={4}>{label}</Title>
          <Text c="text-secondary">{description}</Text>
        </Stack>
        {rightSection}
      </Group>
      {children}
    </Stack>
  );
}
