import { useSetting } from "metabase/settings";

/** Returns the user-configured display name for Metabot (defaults to "Metabot"). */
export const useMetabotName = (): string => {
  return useSetting("metabot-name") || "Metabot";
};
