import { useMemo } from "react";
import { match } from "ts-pattern";

import type { SdkIframeEmbedSetupStep } from "metabase/embedding/embedding-iframe-sdk-setup/types";

import {
  trackEmbedWizardExperienceCompleted,
  trackEmbedWizardOptionsCompleted,
  trackEmbedWizardResourceSelectionCompleted,
} from "../analytics";
import { EMBED_STEPS } from "../constants";
import type { SdkIframeEmbedSetupContextType } from "../context";

export function useSdkIframeEmbedNavigation({
  isSimpleEmbedFeatureAvailable,
  isGuestEmbedsEnabled,
  isSsoEnabledAndConfigured,
  initialState,
  experience,
  resource,
  defaultStep,
  currentStep,
  setCurrentStep,
  settings,
  defaultSettings,
  embeddingParameters,
}: Pick<
  SdkIframeEmbedSetupContextType,
  | "isSimpleEmbedFeatureAvailable"
  | "isGuestEmbedsEnabled"
  | "isSsoEnabledAndConfigured"
  | "initialState"
  | "experience"
  | "resource"
  | "currentStep"
  | "setCurrentStep"
  | "settings"
  | "defaultSettings"
  | "embeddingParameters"
> & {
  defaultStep: SdkIframeEmbedSetupStep;
}) {
  const availableSteps = useMemo(() => {
    // Exclude non-applicable steps for the current embed type
    return EMBED_STEPS.filter((step) => !step.skipFor?.includes(experience));
  }, [experience]);

  const handleNext = () => {
    const currentIndex = availableSteps.findIndex(
      (step) => step.id === currentStep,
    );

    const nextStep = availableSteps[currentIndex + 1];

    match(currentStep)
      .with("select-embed-experience", () => {
        trackEmbedWizardExperienceCompleted({
          experience,
          defaultExperience: defaultSettings.experience,
          settings,
        });
      })
      .with("select-embed-resource", () => {
        trackEmbedWizardResourceSelectionCompleted({
          experience,
          currentSettings: settings,
          defaultResourceId: defaultSettings.resourceId,
        });
      })
      .with("select-embed-options", () => {
        trackEmbedWizardOptionsCompleted({
          initialState,
          experience,
          resource,
          settings,
          isSimpleEmbedFeatureAvailable,
          isGuestEmbedsEnabled,
          isSsoEnabledAndConfigured,
          embeddingParameters,
        });
      });

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

  const currentIndex = availableSteps.findIndex(
    (step) => step.id === currentStep,
  );

  const isFirstStep = currentStep === defaultStep;
  const isLastStep = currentIndex === availableSteps.length - 1;

  const defaultStepIndex = EMBED_STEPS.findIndex(
    ({ id }) => id === defaultStep,
  );

  const canGoNext = currentIndex < availableSteps.length - 1;
  const canGoBack = currentIndex > defaultStepIndex;

  return {
    handleNext,
    handleBack,

    canGoNext,
    canGoBack,

    isFirstStep,
    isLastStep,
  };
}
