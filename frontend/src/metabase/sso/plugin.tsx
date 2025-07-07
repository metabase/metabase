import type { GetAuthProviders } from "metabase/plugins/types";

import { ssoAuthProvider } from "../auth/providers/sso";

export const getSSOMethods: GetAuthProviders = (providers) => {
  // Check if SSO is enabled via API call or settings
  // For now, we'll check if window.METABASE_SSO_CONFIG exists
  const isSSO = typeof window !== "undefined" && (window as any).METABASE_SSO_CONFIG?.enabled;
  
  if (isSSO) {
    return [...providers, ssoAuthProvider];
  }
  return providers;
};