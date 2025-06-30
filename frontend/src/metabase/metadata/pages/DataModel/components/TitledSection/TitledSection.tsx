import type { ReactNode } from "react";

import { Card, Stack, Text } from "metabase/ui";

interface Props {
  children?: ReactNode;
  title: string;
}

export const TitledSection = ({ children, title }: Props) => {
  return (
    <Card p="lg" pt="md" shadow="xs" withBorder>
      <Stack gap="lg">
        <Text c="text-secondary" fw="bold" size="sm">
          {title}
        </Text>

        {children}
      </Stack>
    </Card>
  );
};
