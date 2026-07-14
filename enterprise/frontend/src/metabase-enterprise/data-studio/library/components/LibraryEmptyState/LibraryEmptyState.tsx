import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useDispatch } from "metabase/redux";
import {
  Button,
  Card,
  Group,
  Icon,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { useCreateLibraryMutation } from "metabase-enterprise/api";
import type { Collection, IconName } from "metabase-types/api";

export type LibraryEmptyStateSection = "tables" | "metrics";

type Props = {
  section?: LibraryEmptyStateSection;
  onPublishTable?: () => void;
};

function getSectionContent(section: LibraryEmptyStateSection) {
  if (section === "metrics") {
    return {
      title: t`Metrics`,
      description: t`Metrics are standardized calculations with known dimensions. Create them in the Library so your team analyzes data consistently.`,
      actionLabel: t`Create a metric`,
      features: [
        {
          icon: "metric" as const,
          title: t`Standardized calculations`,
          description: t`Define metrics once and reuse them across questions and dashboards`,
        },
        {
          icon: "verified_round" as const,
          title: t`High trust`,
          description: t`Default to reliable definitions your data team prescribes`,
        },
      ],
    };
  }

  return {
    title: t`Published tables`,
    description: t`Published tables are cleaned, pre-transformed data sources ready for exploring. Publish them to the Library so everyone can start from trusted data.`,
    actionLabel: t`Publish a table`,
    features: [
      {
        icon: "table" as const,
        title: t`Ready to explore`,
        description: t`Cleaned, pre-transformed data sources ready for exploring`,
      },
      {
        icon: "verified_round" as const,
        title: t`High trust`,
        description: t`Default to reliable sources your data team prescribes`,
      },
    ],
  };
}

function getMetricsCollectionId(library: Collection) {
  return library.children?.find(
    (collection) => collection.type === "library-metrics",
  )?.id;
}

export function LibraryEmptyState({
  section = "tables",
  onPublishTable,
}: Props) {
  const dispatch = useDispatch();
  const [createLibrary, { isLoading }] = useCreateLibraryMutation();
  const [error, setError] = useState<string | null>(null);
  const content = getSectionContent(section);

  const ensureLibrary = async () => {
    return createLibrary().unwrap();
  };

  const handlePrimaryAction = async () => {
    try {
      setError(null);
      const library = await ensureLibrary();

      if (section === "metrics") {
        dispatch(
          push(
            Urls.newDataStudioMetric({
              collectionId: getMetricsCollectionId(library),
            }),
          ),
        );
        return;
      }

      onPublishTable?.();
    } catch (error) {
      setError(getErrorMessage(error));
    }
  };

  return (
    <Card bg="background_page-primary" p={48} maw={640} mx="auto" withBorder>
      <Stack gap="3rem">
        <Stack gap="md">
          <Stack gap="sm">
            <Title order={3}>{content.title}</Title>
            <Text c="text-secondary" lh="1.25rem">
              {content.description}
            </Text>
          </Stack>
          <Stack gap="sm">
            <Group gap="sm">
              <Button
                variant="filled"
                onClick={handlePrimaryAction}
                loading={isLoading}
              >
                {content.actionLabel}
              </Button>
            </Group>
            {error && <Text c="feedback-negative">{error}</Text>}
          </Stack>
        </Stack>
        <SimpleGrid cols={2} spacing="sm">
          {content.features.map((feature) => (
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

type FeatureCardProps = {
  icon: IconName;
  title: string;
  description: string;
};

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <Paper bg="background_page-secondary" p="md" radius="8px" shadow="none">
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <Icon name={icon} size={16} c="core-brand" style={{ flexShrink: 0 }} />
        <Stack gap="xs">
          <Text fw="bold" lh="1rem">
            {title}
          </Text>
          <Text c="text-secondary" lh="1rem">
            {description}
          </Text>
        </Stack>
      </Group>
    </Paper>
  );
}
