import type {
  GuestEmbedResourceType,
  SdkIframeEmbedSetupExperience,
} from "metabase/embedding/types";

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
