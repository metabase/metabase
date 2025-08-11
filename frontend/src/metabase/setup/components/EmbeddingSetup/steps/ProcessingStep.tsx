import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { useLazyGetXrayDashboardForModelQuery } from "metabase/api/automagic-dashboards";
import { useCreateCardMutation } from "metabase/api/card";
import { useSaveDashboardMutation } from "metabase/api/dashboard";
import { useUpdateSettingsMutation } from "metabase/api/settings";
import { useSetting } from "metabase/common/hooks";
import { Box, Loader, Stack, Text, Title } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { useEmbeddingSetup } from "../EmbeddingSetupContext";

export const ProcessingStep = () => {
  const siteUrl = useSetting("site-url");

  const { goToNextStep } = useEmbeddingSetup();

  const [processingStep, setProcessingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [updateSettings] = useUpdateSettingsMutation();
  const [createCard] = useCreateCardMutation();
  const [saveDashboard] = useSaveDashboardMutation();
  const [getXrayDashboardForModel] = useLazyGetXrayDashboardForModelQuery();

  const {
    database,
    selectedTables,
    processingStatus,
    setProcessingStatus,
    setCreatedDashboard,
  } = useEmbeddingSetup();

  const setupSettings = useCallback(async () => {
    await updateSettings({
      "embedding-homepage": "visible",
      "enable-embedding-interactive": true,
      "embedding-app-origins-interactive": `localhost:* ${siteUrl}`,
      "session-cookie-samesite": "none",
    });
  }, [updateSettings, siteUrl]);

  useEffect(() => {
    const process = async () => {
      const databaseId = database?.id;
      if (!databaseId || !selectedTables?.length) {
        setError("No database or tables selected");
        return;
      }

      try {
        setProcessingStatus(t`Setting up settings...`);
        await setupSettings();
        setProcessingStep((prev) => prev + 1);

        // Create models for each table
        setProcessingStatus(t`Creating models...`);

        const models = await Promise.all(
          selectedTables.map(async (table) => {
            const model = await createCard({
              name: table.display_name,
              type: "model",
              display: "table",
              visualization_settings: {},
              dataset_query: {
                type: "query",
                database: databaseId,
                query: { "source-table": table.id },
              },
              description: `A model created via the embedding setup flow`,
            }).unwrap();
            setProcessingStep((prev) => prev + 1);
            return model;
          }),
        );

        // Get the x-ray dashboard content (this doesn't save the dashboard yet)
        setProcessingStatus(t`Creating dashboards...`);
        const dashboardsContent = await Promise.all(
          models.map(async (model) => {
            const dashboardContent = await getXrayDashboardForModel({
              modelId: model.id,
              dashboard_load_id: Date.now(),
            }).unwrap();
            return dashboardContent;
          }),
        );

        // Save the dashboards one at the time, to avoid creating multiple "Automatically Generated Dashboards" collections
        const dashboards: Dashboard[] = [];
        for (const dashboard of dashboardsContent) {
          const savedDashboard = await saveDashboard(dashboard).unwrap();
          setProcessingStep((prev) => prev + 1);
          dashboards.push(savedDashboard);
        }

        setCreatedDashboard(dashboards);

        goToNextStep();
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      }
    };

    process();
  }, [
    database?.id,
    selectedTables,
    setProcessingStatus,
    setCreatedDashboard,
    setupSettings,
    goToNextStep,
    createCard,
    saveDashboard,
    getXrayDashboardForModel,
  ]);

  if (error) {
    return (
      <Box ta="center" py="xl">
        <Text color="error">{error}</Text>
      </Box>
    );
  }

  const totalSteps = selectedTables?.length * 2 + 1 || 0;
  const progress = totalSteps > 0 ? (processingStep / totalSteps) * 100 : 0;

  return (
    <Box>
      <Title order={2} mb="lg">{t`Setting Up Your Analytics`}</Title>
      <Stack gap="lg">
        <Box ta="center">
          <Loader size="lg" />
          <Text mt="md">{t`${progress.toFixed(0)}% Complete`}</Text>
        </Box>
        <Text ta="center">{processingStatus}</Text>
      </Stack>
    </Box>
  );
};
