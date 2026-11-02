import { type ComponentProps, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { trackDataStudioLibraryCreated } from "metabase/common/data-studio/analytics";
import { FeatureEmptyState } from "metabase/common/data-studio/components/FeatureEmptyState";
import { useMetadataToasts } from "metabase/common/hooks";
import { Button, Group, Stack, Text } from "metabase/ui";
import { useCreateLibraryMutation } from "metabase-enterprise/api";

type LibrarySection = "semantic-layer" | "dashboards";

type LibraryPitch = {
  title: string;
  description: string;
  actionLabel: string;
  successMessage: string;
  features: ComponentProps<typeof FeatureEmptyState>["features"];
};

type LibraryEmptyStateProps = {
  section: LibrarySection;
};

export function LibraryEmptyState({ section }: LibraryEmptyStateProps) {
  const [createLibrary, { isLoading, isSuccess }] = useCreateLibraryMutation();
  const { sendSuccessToast } = useMetadataToasts();
  const [error, setError] = useState<string | null>(null);
  const pitch = getPitch(section);

  const handleSubmit = async () => {
    try {
      setError(null);
      const collection = await createLibrary().unwrap();
      sendSuccessToast(pitch.successMessage);
      trackDataStudioLibraryCreated(collection.id);
    } catch (error) {
      setError(getErrorMessage(error));
    }
  };

  if (isSuccess) {
    return null;
  }

  return (
    <FeatureEmptyState
      title={pitch.title}
      description={pitch.description}
      actions={
        <Stack gap="sm">
          <Group gap="sm">
            <Button variant="filled" onClick={handleSubmit} loading={isLoading}>
              {pitch.actionLabel}
            </Button>
          </Group>
          {error && <Text c="feedback-negative">{error}</Text>}
        </Stack>
      }
      features={pitch.features}
    />
  );
}

function getPitch(section: LibrarySection): LibraryPitch {
  switch (section) {
    case "semantic-layer":
      return {
        title: t`A source of truth for analytics`,
        description: t`The semantic layer helps you create a source of truth for analytics by providing a centrally managed set of curated content. It separates authoritative, reusable components from ad-hoc analyses.`,
        actionLabel: t`Create my semantic layer`,
        successMessage: t`Semantic layer created`,
        features: [
          {
            icon: "table",
            title: t`Tables`,
            description: t`Cleaned, pre-transformed data sources ready for exploring`,
          },
          {
            icon: "metric",
            title: t`Metrics`,
            description: t`Standardized calculations with known dimensions`,
          },
          {
            icon: "git_branch",
            title: t`Version control`,
            description: t`Sync your semantic layer to git`,
          },
          {
            icon: "verified_round",
            title: t`High trust`,
            description: t`Default to reliable sources your data team prescribes`,
          },
        ],
      };
    case "dashboards":
      return {
        title: t`Dashboards your team can trust`,
        description: t`Library dashboards are the ones everyone can rely on: curated, centrally managed, and kept apart from ad-hoc analyses. Creating the library adds a Dashboards section to put them in, alongside the tables and metrics your data team publishes.`,
        actionLabel: t`Create my library`,
        successMessage: t`Library created`,
        features: [
          {
            icon: "dashboard",
            title: t`Curated dashboards`,
            description: t`Keep the dashboards everyone relies on apart from ad-hoc work`,
          },
          {
            icon: "metric",
            title: t`Trusted numbers`,
            description: t`Chart the metrics and tables your data team publishes`,
          },
          {
            icon: "git_branch",
            title: t`Version control`,
            description: t`Sync library dashboards to git`,
          },
          {
            icon: "verified_round",
            title: t`High trust`,
            description: t`Point people at the dashboards your data team maintains`,
          },
        ],
      };
  }
}
