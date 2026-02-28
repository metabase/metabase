import { useSetting } from "metabase/common/hooks";

export const useIsSsoEnabledAndConfigured = () => {
  const isJwtEnabledAndConfigured = useSetting("jwt-enabled-and-configured");
  const isSamlEnabled = useSetting("saml-enabled");
  const isSamlConfigured = useSetting("saml-configured");

  return isJwtEnabledAndConfigured || (isSamlEnabled && isSamlConfigured);
};
