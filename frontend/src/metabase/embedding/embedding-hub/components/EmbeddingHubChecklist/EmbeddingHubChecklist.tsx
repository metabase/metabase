import { useMemo } from "react";

import type {
  EmbeddingHubModalToTrigger,
  EmbeddingHubStep,
  EmbeddingHubStepId,
} from "../../types";
import { StepperWithCards } from "../StepperWithCards/StepperWithCards";

interface EmbeddingHubChecklistProps {
  steps: EmbeddingHubStep[];
  onModalAction?: (modal: EmbeddingHubModalToTrigger) => void;

  defaultOpenStep?: EmbeddingHubStepId;
  completedSteps?: Partial<Record<EmbeddingHubStepId, boolean>>;
  lockedSteps?: Partial<Record<EmbeddingHubStepId, boolean>>;
}

export const EmbeddingHubChecklist = ({
  steps,
}: EmbeddingHubChecklistProps) => {
  const stepperSteps = useMemo(() => {
    return steps.map((step) => ({
      title: step.title,
      cards: step.actions.map((action) => ({
        title: action.title,
        description: action.description,
        optional: action.optional,
      })),
    }));
  }, [steps]);

  return <StepperWithCards steps={stepperSteps} />;
};
