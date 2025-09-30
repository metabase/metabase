import type { HTMLAttributes, ReactNode } from "react";

import { Card, Group, Stack, Text, Title } from "metabase/ui";

type SplitSectionProps = {
  label: string;
  description: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

export function SplitSection({
  label,
  description,
  children,
  ...rest
}: SplitSectionProps) {
  return (
    <Stack align="start" {...rest}>
      <Stack flex={3} py="md" gap="md" maw="15rem">
        <Title order={4}>{label}</Title>
        <Text c="text-secondary">{description}</Text>
      </Stack>
      <Card flex={8} p={0} shadow="none" withBorder>
        {children}
      </Card>
    </Stack>
  );
}
