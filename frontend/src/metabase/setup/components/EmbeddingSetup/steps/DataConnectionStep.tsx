import { t } from "ttag";

import { DatabaseForm } from "metabase/databases/components/DatabaseForm";
import { Stack, Text, Title } from "metabase/ui";
import type { DatabaseData } from "metabase-types/api";

interface DataConnectionStepProps {
  onSubmit: (database: DatabaseData) => void;
  error?: string;
}

export const DataConnectionStep = ({
  onSubmit,
  error,
}: DataConnectionStepProps) => {
  return (
    <Stack gap="xl">
      <Stack gap="md">
        <Title order={2}>{t`Connect to your data`}</Title>
        <Text size="lg">
          {t`Connect to your database to get started with embedding. We'll automatically create models and X-rays for your data.`}
        </Text>
        {error && (
          <Text color="error" role="alert">
            {error}
          </Text>
        )}
      </Stack>

      <DatabaseForm
        onSubmit={onSubmit}
        onEngineChange={() => {}}
        onCancel={() => {}}
      />
    </Stack>
  );
};
