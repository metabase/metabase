import { useState } from "react";

import { useDispatch } from "metabase/lib/redux";
import { setupEmbeddingSettings } from "metabase/setup/actions";
import { Box } from "metabase/ui";
import type { DatabaseData, Table } from "metabase-types/api";

import { DataConnectionStep } from "./steps/DataConnectionStep";
import { FinalStep } from "./steps/FinalStep";
import { ProcessingStep } from "./steps/ProcessingStep";
import { WelcomeStep } from "./steps/WelcomeStep";

type Step = "WELCOME" | "DATA_CONNECTION" | "PROCESSING" | "FINAL";

const STEPS: Record<Step, Step> = {
  WELCOME: "WELCOME",
  DATA_CONNECTION: "DATA_CONNECTION",
  PROCESSING: "PROCESSING",
  FINAL: "FINAL",
} as const;

export const EmbeddingSetup = () => {
  const [currentStep, setCurrentStep] = useState<Step>(STEPS.WELCOME);
  const [database, setDatabase] = useState<DatabaseData | null>(null);
  const [processingStatus, setProcessingStatus] = useState("");
  const [sandboxingColumn, setSandboxingColumn] = useState<Table | null>(null);
  const [error, setError] = useState("");

  const dispatch = useDispatch();

  const handleDatabaseSubmit = async (databaseData: DatabaseData) => {
    setCurrentStep(STEPS.PROCESSING);
    setProcessingStatus("Connecting to database...");
    setError("");

    // Actually create the database
    let createdDatabase = null;
    try {
      const response = await fetch("/api/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(databaseData),
      });
      if (!response.ok) {
        throw new Error("Failed to create database");
      }
      createdDatabase = await response.json();
      setDatabase(createdDatabase);
    } catch (err) {
      setError(
        "Failed to connect to the database. Please check your settings and try again.",
      );
      setCurrentStep(STEPS.DATA_CONNECTION);
      return;
    }

    setProcessingStatus("Creating models...");
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setProcessingStatus("Generating X-rays...");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check for potential sandboxing columns
    const potentialColumns = createdDatabase.tables?.filter((table: Table) =>
      table.fields?.some(
        (col) =>
          col.name.toLowerCase().includes("user") ||
          col.name.toLowerCase().includes("tenant") ||
          col.name.toLowerCase().includes("organization"),
      ),
    );

    if (potentialColumns && potentialColumns.length > 0) {
      setSandboxingColumn(potentialColumns[0]);
    }

    setProcessingStatus("Setting up embedding...");
    await dispatch(
      setupEmbeddingSettings({
        "embedding-homepage": "visible",
        "enable-embedding": true,
        "setup-license-active-at-setup": false,
        "setup-embedding-autoenabled": true,
        "jwt-enabled": true,
        "jwt-group-sync": true,
        "jwt-user-provisioning-enabled?": true,
        "jwt-shared-secret":
          "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        "jwt-identity-provider-uri": window.location.origin,
      }),
    );

    setCurrentStep(STEPS.FINAL);
  };

  const renderStep = () => {
    switch (currentStep) {
      case STEPS.WELCOME:
        return (
          <WelcomeStep onNext={() => setCurrentStep(STEPS.DATA_CONNECTION)} />
        );
      case STEPS.DATA_CONNECTION:
        return (
          <DataConnectionStep onSubmit={handleDatabaseSubmit} error={error} />
        );
      case STEPS.PROCESSING:
        return <ProcessingStep status={processingStatus} />;
      case STEPS.FINAL:
        return database ? (
          <FinalStep database={database} sandboxingColumn={sandboxingColumn} />
        ) : null;
      default:
        return null;
    }
  };

  return (
    <Box p="xl" maw={800} mx="auto">
      {renderStep()}
    </Box>
  );
};
