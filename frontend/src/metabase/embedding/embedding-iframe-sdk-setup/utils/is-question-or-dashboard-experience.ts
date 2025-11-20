import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/embedding-iframe-sdk-setup/types";

export const isQuestionOrDashboardExperience = (
  experience: SdkIframeEmbedSetupExperience,
) => ["dashboard", "chart"].includes(experience);
