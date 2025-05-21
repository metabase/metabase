import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { DatabaseForm } from "metabase/databases/components/DatabaseForm";
import { useDispatch } from "metabase/lib/redux";
import { Stack, Text, Title } from "metabase/ui";
import type { DatabaseData } from "metabase-types/api";

type DataConnectionStepProps = {
  onSubmit: (databaseData: DatabaseData) => Promise<void>;
  error: string;
};

export const DataConnectionStep = ({
  onSubmit,
  error,
}: DataConnectionStepProps) => {
  const dispatch = useDispatch();

  const handleSubmit = useCallback(
    async (databaseData: DatabaseData) => {
      await onSubmit(databaseData);
      dispatch(push("/setup/embedding/processing"));
    },
    [onSubmit, dispatch],
  );

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
        onSubmit={handleSubmit}
        onEngineChange={() => {}}
        onCancel={() => {}}
      />
    </Stack>
  );
};
