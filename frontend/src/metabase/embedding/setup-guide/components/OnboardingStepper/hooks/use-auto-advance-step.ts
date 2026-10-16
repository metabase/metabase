import { useEffect, useRef } from "react";

import { getNextStepToActivate } from "../utils/get-next-step-to-activate";

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
  const prevCompletedStepsRef = useRef(completedSteps);

  activeStepRef.current = activeStep;

  useEffect(() => {
    const currentStepId = activeStepRef.current;
    const currentStepIndex = currentStepId ? stepIds.indexOf(currentStepId) : 0;
    const prevCompletedSteps = prevCompletedStepsRef.current;

    // Check if the current step was already completed before this render.
    // If so, the user manually reopened a completed step - don't auto-advance.
    const wasCurrentStepAlreadyCompleted = currentStepId
      ? prevCompletedSteps[currentStepId]
      : false;

    // Update the ref for next render
    prevCompletedStepsRef.current = completedSteps;

    if (wasCurrentStepAlreadyCompleted) {
      return;
    }

    const nextStepId = getNextStepToActivate({
      stepIds,
      completedSteps,
      lockedSteps,
      fromIndex: currentStepIndex,
    });

    if (nextStepId !== currentStepId) {
      setActiveStep(nextStepId);
    }
  }, [stepIds, completedSteps, lockedSteps, setActiveStep]);
}
