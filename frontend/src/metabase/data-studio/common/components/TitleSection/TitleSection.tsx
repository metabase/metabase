import type { ReactNode } from "react";

import { Card, Group, Stack, Text, Title } from "metabase/ui";

type TitleSectionProps = {
  label: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  "data-testid"?: string;
};

export function TitleSection({
  label,
  description,
  children,
  "data-testid": dataTestId,
}: TitleSectionProps) {
  return (
    <Stack data-testid={dataTestId}>
      <Group>
        <Stack flex={1} gap="sm">
          <Title order={4}>{label}</Title>
          {description != null && <Text c="text-secondary">{description}</Text>}
        </Stack>
      </Group>
      <Card p={0} shadow="none" withBorder>
        {children}
      </Card>
    </Stack>
  );
}
