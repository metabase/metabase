import { useSetting } from "metabase/settings";

export const useIsSsoEnabledAndConfigured = () => {
  const isJwtEnabledAndConfigured = useSetting("jwt-enabled-and-configured");
  const isSamlEnabled = useSetting("saml-enabled");
  const isSamlConfigured = useSetting("saml-configured");

  return isJwtEnabledAndConfigured || (isSamlEnabled && isSamlConfigured);
};
