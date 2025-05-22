import { useEffect, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { Box, Loader, Stack, Text, Title } from "metabase/ui";

import { useEmbeddingSetup } from "../EmbeddingSetupContext";

export const ProcessingStep = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const dispatch = useDispatch();
  const {
    database,
    selectedTables,
    processingStatus,
    setProcessingStatus,
    setCreatedDashboardIds,
  } = useEmbeddingSetup();

  useEffect(() => {
    const processTables = async () => {
      if (!database?.id || !selectedTables?.length) {
        setError("No database or tables selected");
        return;
      }

      try {
        // Create models for each table
        setProcessingStatus("Creating models...");
        const models = [];
        for (const table of selectedTables) {
          const response = await fetch("/api/card", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: table.display_name,
              type: "model",
              display: "table",
              result_metadata: null,
              collection_id: null,
              collection_position: 1,
              visualization_settings: {},
              dataset_query: {
                type: "query",
                database: database.id,
                query: { "source-table": table.id },
              },
              description: `A model created via the embedding setup flow`,
            }),
          });

          if (!response.ok) {
            throw new Error(`Failed to create model for ${table.display_name}`);
          }

          const model = await response.json();
          models.push(model);
          setCurrentStep((prev) => prev + 1);
        }

        // Create x-ray dashboards for each model
        setProcessingStatus("Creating dashboards...");
        const dashboardIds = [];
        for (const model of models) {
          // Get the x-ray dashboard layout
          const xrayResponse = await fetch(
            `/api/automagic-dashboards/model/${model.id}?dashboard_load_id=${Date.now()}`,
          );

          if (!xrayResponse.ok) {
            throw new Error(`Failed to generate x-ray for ${model.name}`);
          }

          const dashboardContent = await xrayResponse.json();

          // Save the dashboard
          const saveResponse = await fetch("/api/dashboard/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dashboardContent),
          });

          if (!saveResponse.ok) {
            throw new Error(`Failed to save dashboard for ${model.name}`);
          }

          const savedDashboard = await saveResponse.json();
          dashboardIds.push(savedDashboard.id);
          setCurrentStep((prev) => prev + 1);
        }

        // Store the created dashboard IDs
        setCreatedDashboardIds(dashboardIds);

        // Move to final step
        dispatch(push("/setup/embedding/final"));
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      }
    };

    processTables();
  }, [
    database?.id,
    selectedTables,
    dispatch,
    setProcessingStatus,
    setCreatedDashboardIds,
  ]);

  if (error) {
    return (
      <Box ta="center" py="xl">
        <Text color="error">{error}</Text>
      </Box>
    );
  }

  const totalSteps = selectedTables?.length * 2 || 0;
  const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  return (
    <Box>
      <Title order={2} mb="lg">{t`Setting Up Your Analytics`}</Title>
      <Stack gap="lg">
        <Box ta="center">
          <Loader size="lg" />
          <Text mt="md">{t`${progress.toFixed(0)}% Complete`}</Text>
        </Box>
        <Text ta="center">{t`${processingStatus}`}</Text>
      </Stack>
    </Box>
  );
};
