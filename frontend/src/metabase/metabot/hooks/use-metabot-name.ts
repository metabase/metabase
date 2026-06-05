import { useSetting } from "metabase/common/hooks";

/** Returns the user-configured display name for Metabot (defaults to "Metabot"). */
export const useMetabotName = (): string => {
  return useSetting("metabot-name") || "Metabot";
};
