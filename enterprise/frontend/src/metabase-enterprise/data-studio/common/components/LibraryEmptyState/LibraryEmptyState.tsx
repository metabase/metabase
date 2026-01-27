import { useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Button,
  Card,
  Group,
  Icon,
  type IconName,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { useCreateLibraryMutation } from "metabase-enterprise/api";
import { trackDataStudioLibraryCreated } from "metabase-enterprise/data-studio/analytics";

export function LibraryEmptyState() {
  const [createLibrary, { isLoading, isSuccess }] = useCreateLibraryMutation();
  const { sendSuccessToast } = useMetadataToasts();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      setError(null);
      const collection = await createLibrary().unwrap();
      sendSuccessToast(t`Library created`);
      trackDataStudioLibraryCreated(collection.id);
    } catch (error) {
      setError(getErrorMessage(error));
    }
  };

  if (isSuccess) {
    return null;
  }

  return (
    <Card bg="background-primary" p={48} maw={640} mx="auto" withBorder>
      <Stack gap="3rem">
        <Stack gap="md">
          <Stack gap="sm">
            <Title order={3}>{t`A source of truth for analytics`}</Title>
            <Text c="text-secondary" lh="1.25rem">
              {t`The Library helps you create a source of truth for analytics by providing a centrally managed set of curated content. It separates authoritative, reusable components from ad-hoc analyses.`}
            </Text>
          </Stack>
          <Stack gap="sm">
            <Group gap="sm">
              <Button
                variant="filled"
                onClick={handleSubmit}
                loading={isLoading}
              >{t`Create my Library`}</Button>
            </Group>
            {error && <Text c="error">{error}</Text>}
          </Stack>
        </Stack>
        <SimpleGrid cols={2} spacing="sm">
          <FeatureCard
            icon="table"
            title={t`Tables`}
            description={t`Cleaned, pre-transformed data sources ready for exploring`}
          />
          <FeatureCard
            icon="metric"
            title={t`Metrics`}
            description={t`Standardized calculations with known dimensions`}
          />
          <FeatureCard
            icon="git_branch"
            title={t`Version control`}
            description={t`Sync your Library to Git`}
          />
          <FeatureCard
            icon="verified_round"
            title={t`High trust`}
            description={t`Default to reliable sources your data team prescribes`}
          />
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
    <Paper bg="background-secondary" p="md" radius="8px" shadow="none">
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <Icon name={icon} size={16} c="brand" style={{ flexShrink: 0 }} />
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
