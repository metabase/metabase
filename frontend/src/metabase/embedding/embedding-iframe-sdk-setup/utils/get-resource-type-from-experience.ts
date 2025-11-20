import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/embedding-iframe-sdk-setup/types";
import type { StaticEmbedResourceType } from "metabase/public/lib/types";

export const getResourceTypeFromExperience = (
  experience: SdkIframeEmbedSetupExperience,
): StaticEmbedResourceType | null => {
  switch (experience) {
    case "dashboard":
      return "dashboard";
    case "chart":
      return "question";
    default:
      return null;
  }
};
