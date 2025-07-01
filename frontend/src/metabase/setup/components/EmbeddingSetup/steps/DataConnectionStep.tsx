import { push } from "react-router-redux";
import { t } from "ttag";

import { createDatabase } from "metabase/admin/databases/database";
import { DatabaseForm } from "metabase/databases/components/DatabaseForm";
import { useDispatch } from "metabase/lib/redux";
import { Stack, Text, Title } from "metabase/ui";
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
        onCancel={() => {
          trackEmbeddingSetupClick("add-data-later-or-skip");
          dispatch(push("/"));
        }}
      />
    </Stack>
  );
};
