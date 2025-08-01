import type { ReactNode } from "react";

import { Card, Flex, Text, Title } from "metabase/ui";

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
    <Flex align="start" gap="5rem">
      <Flex direction="column" flex="0 1 100%" py="sm" gap="md" maw="15rem">
        <Title order={4} c="text-primary">
          {label}
        </Title>
        <Text c="text-secondary">{description}</Text>
      </Flex>
      <Card p={0} flex="1 1 100%">
        {children}
      </Card>
    </Flex>
  );
}
