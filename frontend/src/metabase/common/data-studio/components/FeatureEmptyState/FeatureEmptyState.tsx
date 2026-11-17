import type { ReactNode } from "react";

import { Card, SimpleGrid, Stack, Text, Title } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { FeatureCard } from "./FeatureCard";

interface FeatureEmptyStateFeature {
  icon: IconName;
  title: string;
  description: string;
}

interface FeatureEmptyStateProps {
  title: string;
  description: ReactNode;
  actions: ReactNode;
  features: FeatureEmptyStateFeature[];
}

export function FeatureEmptyState({
  title,
  description,
  actions,
  features,
}: FeatureEmptyStateProps) {
  return (
    <Card bg="background_page-primary" p={48} maw={640} mx="auto" withBorder>
      <Stack gap="3rem">
        <Stack gap="lg">
          <Stack gap="sm">
            <Title order={3}>{title}</Title>
            <Text c="text-secondary" lh="1.25rem">
              {description}
            </Text>
          </Stack>
          {actions}
        </Stack>
        <SimpleGrid cols={2} spacing="sm">
          {features.map((feature) => (
            <FeatureCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </SimpleGrid>
      </Stack>
    </Card>
  );
}
