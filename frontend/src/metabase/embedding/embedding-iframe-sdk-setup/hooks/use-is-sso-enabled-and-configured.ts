import { useSetting } from "metabase/common/hooks";

export const useIsSsoEnabledAndConfigured = () => {
  const isJwtEnabled = useSetting("jwt-enabled");
  const isSamlEnabled = useSetting("saml-enabled");
  const isJwtConfigured = useSetting("jwt-configured");
  const isSamlConfigured = useSetting("saml-configured");

  return (
    (isJwtEnabled && isJwtConfigured) || (isSamlEnabled && isSamlConfigured)
  );
};
