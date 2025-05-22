import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { DatabaseForm } from "metabase/databases/components/DatabaseForm";
import { useDispatch } from "metabase/lib/redux";
import { Stack, Text, Title } from "metabase/ui";
import type { DatabaseData } from "metabase-types/api";

import { useEmbeddingSetup } from "../EmbeddingSetupContext";

export const DataConnectionStep = () => {
  const dispatch = useDispatch();
  const { setDatabase, setError, setProcessingStatus } = useEmbeddingSetup();

  const handleSubmit = useCallback(
    async (databaseData: DatabaseData) => {
      setProcessingStatus("Connecting to database...");
      setError("");

      try {
        const response = await fetch("/api/database", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(databaseData),
        });
        if (!response.ok) {
          throw new Error("Failed to create database");
        }
        const createdDatabase = await response.json();
        setDatabase(createdDatabase);
        dispatch(push("/setup/embedding/table-selection"));
      } catch (err) {
        setError(
          "Failed to connect to the database. Please check your settings and try again.",
        );
      }
    },
    [dispatch, setDatabase, setError, setProcessingStatus],
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
        onCancel={() => {}}
      />
    </Stack>
  );
};
