import type { StaticEmbedResourceType } from "metabase/public/lib/types";
import type { SdkIframeEmbedSetupExperience } from "metabase-enterprise/embedding_iframe_sdk_setup/types";

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
