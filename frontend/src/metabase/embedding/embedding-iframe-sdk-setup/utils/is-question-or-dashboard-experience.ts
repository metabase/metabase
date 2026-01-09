import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/embedding-iframe-sdk-setup/types";

export const isQuestionOrDashboardExperience = (
  experience: SdkIframeEmbedSetupExperience,
): experience is "dashboard" | "chart" =>
  ["dashboard", "chart"].includes(experience);
