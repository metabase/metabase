import { useAdminSetting } from "metabase/api/utils";

export const useMetabotEnabled = () => {
  const { value: isEnabled } = useAdminSetting("metabot-feature-enabled");

  return !!isEnabled;
};
