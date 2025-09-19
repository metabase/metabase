import { useMemo } from "react";

import { EMBED_STEPS } from "../constants";
import { useSdkIframeEmbedSetupContext } from "../context";

export function useSdkIframeEmbedNavigation() {
  const { startWith, experience, currentStep, setCurrentStep } =
    useSdkIframeEmbedSetupContext();

  const availableSteps = useMemo(() => {
    // Exclude non-applicable steps for the current embed type
    return EMBED_STEPS.filter((step) => !step.skipFor?.includes(experience));
  }, [experience]);

  const handleNext = () => {
    const currentIndex = availableSteps.findIndex(
      (step) => step.id === currentStep,
    );

    const nextStep = availableSteps[currentIndex + 1];

    if (nextStep) {
      setCurrentStep(nextStep.id);
    }
  };

  const handleBack = () => {
    const currentIndex = availableSteps.findIndex(
      (step) => step.id === currentStep,
    );

    const prevStep = availableSteps[currentIndex - 1];

    if (prevStep) {
      setCurrentStep(prevStep.id);
    }
  };

  const firstStepIndex = startWith
    ? availableSteps.findIndex((step) => step.id === startWith.step)
    : 0;
  const currentIndex = availableSteps.findIndex(
    (step) => step.id === currentStep,
  );

  const canGoNext = currentIndex < availableSteps.length - 1;
  const canGoBack = currentIndex > firstStepIndex;

  const isLastStep = currentIndex === availableSteps.length - 1;

  const StepContent = useMemo(
    () =>
      EMBED_STEPS.find((step) => step.id === currentStep)?.component ?? noop,
    [currentStep],
  );

  return {
    handleNext,
    handleBack,

    canGoNext,
    canGoBack,

    isLastStep,
    StepContent,
  };
}

const noop = () => null;
