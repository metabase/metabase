import type { SdkIframeEmbedSetupStep } from "metabase/embedding/embedding-iframe-sdk-setup/types";

export const isStepWithResource = (step: SdkIframeEmbedSetupStep) =>
  step === "select-embed-options" || step === "get-code";
