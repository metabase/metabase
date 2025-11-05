import type { SdkIframeEmbedSetupStep } from "metabase-enterprise/embedding_iframe_sdk_setup/types";

export const isStepWithResource = (step: SdkIframeEmbedSetupStep) =>
  step === "select-embed-options" || step === "get-code";
