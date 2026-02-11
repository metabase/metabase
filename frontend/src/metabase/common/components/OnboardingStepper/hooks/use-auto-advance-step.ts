import { useEffect, useRef } from "react";

interface UseAutoAdvanceStepProps {
  stepIds: string[];
  completedSteps: Record<string, boolean>;
  activeStep: string | null;
  setActiveStep: (stepId: string | null) => void;
}

/**
 * Advances to the next incomplete step when steps are completed.
 *
 * This hook only advances forward (never jumps back) and only triggers when
 * `completedSteps` changes. Manual step selection by the user does not trigger
 * auto-advance.
 *
 * We read `activeStep` via a ref to avoid including it in
 * effect dependencies, so effect only runs when steps are
 * completed, not when the user manually navigates between steps.
 */
export function useAutoAdvanceStep({
  stepIds,
  completedSteps,
  activeStep,
  setActiveStep,
}: UseAutoAdvanceStepProps): void {
  const activeStepRef = useRef(activeStep);

  activeStepRef.current = activeStep;

  useEffect(() => {
    const currentStepId = activeStepRef.current;
    const currentStepIndex = currentStepId ? stepIds.indexOf(currentStepId) : 0;

    const nextIncompleteStepId =
      stepIds.slice(currentStepIndex).find((id) => !completedSteps[id]) ?? null;

    if (nextIncompleteStepId !== currentStepId) {
      setActiveStep(nextIncompleteStepId);
    }
  }, [completedSteps, stepIds, setActiveStep]);
}
