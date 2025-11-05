import type { SdkIframeEmbedSetupExperience } from "metabase-enterprise/embedding_iframe_sdk_setup/types";

export const isQuestionOrDashboardExperience = (
  experience: SdkIframeEmbedSetupExperience,
) => ["dashboard", "chart"].includes(experience);
