import { useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { trackDataStudioLibraryCreated } from "metabase/common/data-studio/analytics";
import { FeatureEmptyState } from "metabase/common/data-studio/components/FeatureEmptyState";
import { useNavigate } from "metabase/router";
import { Button, Group, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useCreateLibraryMutation } from "metabase-enterprise/api";

export type LibraryEmptyStateSection = "tables" | "metrics";

type LibraryEmptyStateProps = {
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

export function LibraryEmptyState({
  section = "tables",
  onPublishTable,
}: LibraryEmptyStateProps) {
  const navigate = useNavigate();
  const [createLibrary, { isLoading }] = useCreateLibraryMutation();
  const [error, setError] = useState<string | null>(null);
  const content = getSectionContent(section);

  const handlePrimaryAction = async () => {
    try {
      setError(null);
      const library = await createLibrary().unwrap();
      trackDataStudioLibraryCreated(library.id);

      if (section === "metrics") {
        const metricCollectionId = library.children?.find(
          (collection) => collection.type === "library-metrics",
        )?.id;
        navigate(
          Urls.newDataStudioMetric({ collectionId: metricCollectionId }),
        );
        return;
      }

      onPublishTable?.();
    } catch (error) {
      setError(getErrorMessage(error));
    }
  };

  return (
    <FeatureEmptyState
      title={content.title}
      description={content.description}
      actions={
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
      }
      features={content.features}
    />
  );
}
