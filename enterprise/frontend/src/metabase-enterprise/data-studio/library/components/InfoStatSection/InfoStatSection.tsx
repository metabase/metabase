import type { ReactNode } from "react";

import { Card, Flex, Text } from "metabase/ui";

type InfoStatSectionProps = {
  label: string;
  /** Lets a control in `value` take the label as its name */
  labelId?: string;
  value: ReactNode;
};

export function InfoStatSection({
  label,
  labelId,
  value,
}: InfoStatSectionProps) {
  return (
    <Card.Section withBorder py="md" px="lg">
      <Flex justify="space-between" align="center" gap="md">
        <Text id={labelId} size="md" c="text-secondary">
          {label}
        </Text>
        <Text component="div" size="md" fw={600}>
          {value}
        </Text>
      </Flex>
    </Card.Section>
  );
}
