import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/embedding-iframe-sdk-setup/types";

export const hasResourceToSelect = (
  experience: SdkIframeEmbedSetupExperience,
): experience is "dashboard" | "chart" | "browser" =>
  ["dashboard", "chart", "browser"].includes(experience);
