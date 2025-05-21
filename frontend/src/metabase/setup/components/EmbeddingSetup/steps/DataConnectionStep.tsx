import { t } from "ttag";

import { DatabaseForm } from "metabase/databases/components/DatabaseForm";
import { Stack, Text, Title } from "metabase/ui";
import type { DatabaseData } from "metabase-types/api";

interface DataConnectionStepProps {
  onSubmit: (database: DatabaseData) => void;
}

export const DataConnectionStep = ({ onSubmit }: DataConnectionStepProps) => {
  return (
    <Stack gap="xl">
      <Stack gap="md">
        <Title order={2}>{t`Connect to your data`}</Title>
        <Text size="lg">
          {t`Connect to your database to get started with embedding. We'll automatically create models and X-rays for your data.`}
        </Text>
      </Stack>

      <DatabaseForm
        onSubmit={onSubmit}
        onEngineChange={() => {}}
        onCancel={() => {}}
      />
    </Stack>
  );
};
