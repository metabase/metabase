import { createContext, useCallback, useContext, useState } from "react";

import type { DatabaseData, Table } from "metabase-types/api";

import { DataConnectionStep } from "./steps/DataConnectionStep";
import { DoneStep } from "./steps/DoneStep";
import { FinalStep } from "./steps/FinalStep";
import { ProcessingStep } from "./steps/ProcessingStep";
import { TableSelectionStep } from "./steps/TableSelectionStep";
import { UserCreationStep } from "./steps/UserCreationStep";
import { WelcomeStep } from "./steps/WelcomeStep";
import type { StepDefinition } from "./steps/embeddingSetupSteps";
import { getStepIndexByKey, steps } from "./steps/embeddingSetupSteps";
import { useForceLocaleRefresh } from "./useForceLocaleRefresh";

export const stepComponents = [
  WelcomeStep,
  UserCreationStep,
  DataConnectionStep,
  TableSelectionStep,
  ProcessingStep,
  FinalStep,
  DoneStep,
] as const;

type EmbeddingSetupContextType = {
  database: DatabaseData | null;
  setDatabase: (database: DatabaseData | null) => void;
  processingStatus: string;
  setProcessingStatus: (status: string) => void;
  error: string;
  setError: (error: string) => void;
  selectedTables: Table[];
  setSelectedTables: (tables: Table[]) => void;
  createdDashboardIds: number[];
  setCreatedDashboardIds: (ids: number[]) => void;
  stepKey: string;
  goToStep: (key: string) => void;
  steps: StepDefinition[];
  stepIndex: number;
  totalSteps: number;
  goToNextStep: () => void;
  StepComponent: (typeof stepComponents)[number];
};

const EmbeddingSetupContext = createContext<EmbeddingSetupContextType | null>(
  null,
);

export const useEmbeddingSetup = () => {
  useForceLocaleRefresh();

  const context = useContext(EmbeddingSetupContext);

  if (!context) {
    throw new Error(
      "useEmbeddingSetup must be used within EmbeddingSetupProvider",
    );
  }
  return context;
};

export const EmbeddingSetupProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [database, setDatabase] = useState<DatabaseData | null>(null);
  const [processingStatus, setProcessingStatus] = useState("");
  const [error, setError] = useState("");
  const [selectedTables, setSelectedTables] = useState<Table[]>([]);
  const [createdDashboardIds, setCreatedDashboardIds] = useState<number[]>([]);
  const [stepKey, goToStep] = useState(steps[0].key);

  const stepIndex = getStepIndexByKey(steps, stepKey);
  const totalSteps = stepComponents.length;
  const StepComponent = stepComponents[stepIndex];

  const goToNextStep = useCallback(() => {
    const nextKey = steps[stepIndex + 1]?.key;
    if (nextKey) {
      goToStep(nextKey);
    }
  }, [stepIndex, goToStep]);

  return (
    <EmbeddingSetupContext.Provider
      value={{
        database,
        setDatabase,
        processingStatus,
        setProcessingStatus,
        error,
        setError,
        selectedTables,
        setSelectedTables,
        createdDashboardIds,
        setCreatedDashboardIds,
        stepKey,
        goToStep,
        steps,
        stepIndex,
        totalSteps,
        goToNextStep,
        StepComponent,
      }}
    >
      {children}
    </EmbeddingSetupContext.Provider>
  );
};
