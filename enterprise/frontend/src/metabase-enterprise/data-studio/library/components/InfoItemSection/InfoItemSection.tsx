import type { ReactNode } from "react";

import { Card, Group, Icon, Text } from "metabase/ui";
import type { IconName } from "metabase-types/api";

type InfoItemSectionProps = {
  icon: IconName;
  value: ReactNode;
  label: string;
};

export function InfoItemSection({ icon, value, label }: InfoItemSectionProps) {
  return (
    <Card.Section withBorder p="lg">
      <Group gap="sm" mb="xxs" wrap="nowrap">
        <Icon name={icon} c="core-brand" />
        <Text size="md" fw={600} lh="1rem">
          {value}
        </Text>
      </Group>
      <Text size="sm" c="text-secondary" lh="1rem" ml="xl">
        {label}
      </Text>
    </Card.Section>
  );
}
