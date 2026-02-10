import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/embedding-iframe-sdk-setup/types";
import type { GuestEmbedResourceType } from "metabase/public/lib/types";

export const getResourceTypeFromExperience = (
  experience: SdkIframeEmbedSetupExperience,
): GuestEmbedResourceType | null => {
  switch (experience) {
    case "dashboard":
      return "dashboard";
    case "chart":
      return "question";
    default:
      return null;
  }
};
