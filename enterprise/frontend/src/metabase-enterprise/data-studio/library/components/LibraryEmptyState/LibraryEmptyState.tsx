import { useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { trackDataStudioLibraryCreated } from "metabase/common/data-studio/analytics";
import { FeatureEmptyState } from "metabase/common/data-studio/components/FeatureEmptyState";
import { useMetadataToasts } from "metabase/common/hooks";
import { Button, Group, Stack, Text } from "metabase/ui";
import { useCreateLibraryMutation } from "metabase-enterprise/api";

export function LibraryEmptyState() {
  const [createLibrary, { isLoading, isSuccess }] = useCreateLibraryMutation();
  const { sendSuccessToast } = useMetadataToasts();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      setError(null);
      const collection = await createLibrary().unwrap();
      sendSuccessToast(t`Semantic layer created`);
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
      title={t`A source of truth for analytics`}
      description={t`The semantic layer helps you create a source of truth for analytics by providing a centrally managed set of curated content. It separates authoritative, reusable components from ad-hoc analyses.`}
      actions={
        <Stack gap="sm">
          <Group gap="sm">
            <Button
              variant="filled"
              onClick={handleSubmit}
              loading={isLoading}
            >{t`Create my semantic layer`}</Button>
          </Group>
          {error && <Text c="feedback-negative">{error}</Text>}
        </Stack>
      }
      features={[
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
      ]}
    />
  );
}
