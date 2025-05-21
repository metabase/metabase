import { useState } from "react";

import { useDispatch } from "metabase/lib/redux";
import { setupEmbeddingSettings } from "metabase/setup/actions";
import { Box } from "metabase/ui";

import { DataConnectionStep } from "./steps/DataConnectionStep";
import { FinalStep } from "./steps/FinalStep";
import { ProcessingStep } from "./steps/ProcessingStep";
import { WelcomeStep } from "./steps/WelcomeStep";

const STEPS = {
  WELCOME: "welcome",
  DATA_CONNECTION: "data_connection",
  PROCESSING: "processing",
  FINAL: "final",
};

export const EmbeddingSetup = () => {
  const [currentStep, setCurrentStep] = useState(STEPS.WELCOME);
  const [database, setDatabase] = useState(null);
  const [processingStatus, setProcessingStatus] = useState("");
  const [sandboxingColumn, setSandboxingColumn] = useState(null);

  const dispatch = useDispatch();

  const handleDatabaseSubmit = async (databaseData) => {
    setDatabase(databaseData);
    setCurrentStep(STEPS.PROCESSING);

    // Simulate processing steps
    setProcessingStatus("Connecting to database...");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setProcessingStatus("Creating models...");
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setProcessingStatus("Generating X-rays...");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Check for potential sandboxing columns
    const potentialColumns = databaseData.tables?.filter((table) =>
      table.columns?.some(
        (col) =>
          col.name.toLowerCase().includes("user") ||
          col.name.toLowerCase().includes("tenant") ||
          col.name.toLowerCase().includes("organization"),
      ),
    );

    if (potentialColumns?.length > 0) {
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
        return <DataConnectionStep onSubmit={handleDatabaseSubmit} />;
      case STEPS.PROCESSING:
        return <ProcessingStep status={processingStatus} />;
      case STEPS.FINAL:
        return (
          <FinalStep database={database} sandboxingColumn={sandboxingColumn} />
        );
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
