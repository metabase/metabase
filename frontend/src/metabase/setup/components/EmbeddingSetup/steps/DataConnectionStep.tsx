import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { createDatabase } from "metabase/admin/databases/database";
import { DatabaseForm } from "metabase/databases/components/DatabaseForm";
import { useDispatch } from "metabase/lib/redux";
import { Button, Stack, Text, Title } from "metabase/ui";
import type { DatabaseData } from "metabase-types/api";

import { useEmbeddingSetup } from "../EmbeddingSetupContext";

export const DataConnectionStep = () => {
  const dispatch = useDispatch();
  const { setDatabase, goToNextStep, trackEmbeddingSetupClick } =
    useEmbeddingSetup();

  const handleSubmit = async (databaseData: DatabaseData) => {
    const createdDatabase = await dispatch(createDatabase(databaseData));
    setDatabase(createdDatabase);
    goToNextStep();
  };
  const onCancel = useCallback(() => {
    trackEmbeddingSetupClick("add-data-later-or-skip");
    dispatch(push("/"));
  }, [dispatch, trackEmbeddingSetupClick]);

  const ContinueWithoutDataButton = useCallback(
    ({ onCancel }: { onCancel?: () => void }) => {
      return (
        <Button variant="subtle" c="text-secondary" onClick={onCancel}>
          {t`I'll add my data later`}
        </Button>
      );
    },
    [],
  );

  return (
    <Stack gap="xl">
      <Stack gap="md">
        <Title order={2}>{t`Connect to your data`}</Title>
        <Text size="lg">
          {t`Connect to your database to get started with embedding. We'll help you select tables to turn into models and dashboards.`}
        </Text>
      </Stack>

      <DatabaseForm
        onSubmit={handleSubmit}
        onEngineChange={() => {}}
        onCancel={onCancel}
        showSampleDatabase={false}
        ContinueWithoutDataSlot={ContinueWithoutDataButton}
        location="embedding_setup"
      />
    </Stack>
  );
};
