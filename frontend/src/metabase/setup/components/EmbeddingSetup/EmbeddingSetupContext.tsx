import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { trackSimpleEvent } from "metabase/lib/analytics";
import { useSelector } from "metabase/lib/redux";
import { getLocale } from "metabase/setup/selectors";
import type { EmbeddingSetupClickEvent } from "metabase-types/analytics";
import type { Dashboard, DatabaseData, Table } from "metabase-types/api";

import { DataConnectionStep } from "./steps/DataConnectionStep";
import { DoneStep } from "./steps/DoneStep";
import { FinalStep } from "./steps/FinalStep";
import { ProcessingStep } from "./steps/ProcessingStep";
import { TableSelectionStep } from "./steps/TableSelectionStep";
import { UserCreationStep } from "./steps/UserCreationStep";
import { WelcomeStep } from "./steps/WelcomeStep";
import type {
  EmbeddingSetupStepKey,
  StepDefinition,
} from "./steps/embeddingSetupSteps";
import { STEPS, getStepIndexByKey } from "./steps/embeddingSetupSteps";

export const STEP_COMPONENTS = [
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
  createdDashboard2: Dashboard[];
  setCreatedDashboard: (dashboards: Dashboard[]) => void;
  stepKey: EmbeddingSetupStepKey;
  goToStep: (key: EmbeddingSetupStepKey) => void;
  steps: StepDefinition[];
  stepIndex: number;
  totalSteps: number;
  goToNextStep: () => void;
  StepComponent: (typeof STEP_COMPONENTS)[number];
  trackEmbeddingSetupClick: (
    eventDetail: EmbeddingSetupClickEvent["event_detail"],
  ) => void;
};

const EmbeddingSetupContext = createContext<EmbeddingSetupContextType | null>(
  null,
);

export const useEmbeddingSetup = () => {
  // This forces the components where it's used to re-render, making `t` use the new locale
  // This is needed because we allow changing the locale from the sidebar, without this trick
  // the components on the page wouldn't re-render with the new locale
  useSelector(getLocale);

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
  const [createdDashboard2, setCreatedDashboard] = useState<Dashboard[]>([]);
  const [stepKey, goToStep] = useState<EmbeddingSetupStepKey>(STEPS[0].key);

  const stepIndex = getStepIndexByKey(stepKey);
  const totalSteps = STEP_COMPONENTS.length;
  const StepComponent = STEP_COMPONENTS[stepIndex];

  const goToNextStep = useCallback(() => {
    const nextKey = STEPS[stepIndex + 1]?.key;
    if (nextKey) {
      goToStep(nextKey);
    }
  }, [stepIndex, goToStep]);

  useEffect(() => {
    trackSimpleEvent({
      event: "embedding_setup_step_seen",
      event_detail: stepKey,
    });
  }, [stepKey]);

  const trackEmbeddingSetupClick = useCallback(
    (eventDetail: EmbeddingSetupClickEvent["event_detail"]) => {
      trackSimpleEvent({
        event: "embedding_setup_click",
        event_detail: eventDetail,
        triggered_from: stepKey,
      });
    },
    [stepKey],
  );

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
        createdDashboard2,
        setCreatedDashboard,
        stepKey,
        goToStep,
        steps: STEPS,
        stepIndex,
        totalSteps,
        goToNextStep,
        StepComponent,
        trackEmbeddingSetupClick,
      }}
    >
      {children}
    </EmbeddingSetupContext.Provider>
  );
};
