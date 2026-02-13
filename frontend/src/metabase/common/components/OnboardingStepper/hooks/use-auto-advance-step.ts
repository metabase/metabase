import { useEffect, useRef } from "react";

import { getNextIncompleteStepFrom } from "../utils/get-next-incomplete-step-from";

/**
 * Automatically advances to the next incomplete step when steps are completed.
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
  lockedSteps,
  activeStep,
  setActiveStep,
}: {
  stepIds: string[];
  completedSteps: Record<string, boolean>;
  lockedSteps?: Record<string, boolean>;
  activeStep: string | null;
  setActiveStep: (stepId: string | null) => void;
}): void {
  const activeStepRef = useRef(activeStep);

  activeStepRef.current = activeStep;

  useEffect(() => {
    const currentStepId = activeStepRef.current;
    const currentStepIndex = currentStepId ? stepIds.indexOf(currentStepId) : 0;

    const nextIncompleteStepId = getNextIncompleteStepFrom({
      stepIds,
      completedSteps,
      lockedSteps,
      fromIndex: currentStepIndex,
    });

    // When all steps are complete, advance to the last step instead of
    // collapsing (returning null). This ensures summary/final steps
    // auto-expand when the user completes the flow.
    const nextStepId =
      nextIncompleteStepId ?? stepIds[stepIds.length - 1] ?? null;

    if (nextStepId !== currentStepId) {
      setActiveStep(nextStepId);
    }
  }, [stepIds, completedSteps, lockedSteps, setActiveStep]);
}
