import type { ReactNode } from "react";

import { Card, Group, Stack, Text, Title } from "metabase/ui";

type CardSectionProps = {
  label: string;
  description: string;
  children?: ReactNode;
};

export function CardSection({
  label,
  description,
  children,
}: CardSectionProps) {
  return (
    <Group align="start" gap="5rem">
      <Stack py="sm" maw="15rem">
        <Title order={4} c="text-primary">
          {label}
        </Title>
        <Text c="text-secondary">{description}</Text>
      </Stack>
      <Card flex={1}>{children}</Card>
    </Group>
  );
}
