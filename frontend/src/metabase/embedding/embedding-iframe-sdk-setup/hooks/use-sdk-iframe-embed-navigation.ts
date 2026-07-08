import { match } from "ts-pattern";

import type { SdkIframeEmbedSetupStep } from "metabase/embedding/embedding-iframe-sdk-setup/types";

import {
  trackEmbedWizardExperienceCompleted,
  trackEmbedWizardOptionsCompleted,
  trackEmbedWizardResourceSelectionCompleted,
} from "../analytics";
import {
  EMBED_STEPS,
  EXPERIENCES_WITHOUT_RESOURCE_SELECTION,
} from "../constants";
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
  const handleNext = () => {
    const currentIndex = EMBED_STEPS.findIndex(
      (step) => step.id === currentStep,
    );

    const nextStep = EMBED_STEPS[currentIndex + 1];

    match(currentStep)
      .with("select-embed-experience", () => {
        trackEmbedWizardExperienceCompleted({
          experience,
          defaultExperience: defaultSettings.experience,
          settings,
        });

        if (
          !EXPERIENCES_WITHOUT_RESOURCE_SELECTION.includes(
            experience as (typeof EXPERIENCES_WITHOUT_RESOURCE_SELECTION)[number],
          )
        ) {
          trackEmbedWizardResourceSelectionCompleted({
            experience,
            currentSettings: settings,
            defaultResourceId: defaultSettings.resourceId,
          });
        }
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
    const currentIndex = EMBED_STEPS.findIndex(
      (step) => step.id === currentStep,
    );

    const prevStep = EMBED_STEPS[currentIndex - 1];

    if (prevStep) {
      setCurrentStep(prevStep.id);
    }
  };

  const currentIndex = EMBED_STEPS.findIndex((step) => step.id === currentStep);

  const isFirstStep = currentStep === defaultStep;
  const isLastStep = currentIndex === EMBED_STEPS.length - 1;

  const defaultStepIndex = EMBED_STEPS.findIndex(
    ({ id }) => id === defaultStep,
  );

  const canGoNext = currentIndex < EMBED_STEPS.length - 1;
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
