import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";
import { AuthProvider } from "./types";

export const getAuthProviders = (): AuthProvider[] => {
  return PLUGIN_AUTH_PROVIDERS.reduce(
    (providers, getProviders) => getProviders(providers),
    [],
  );
};

export const getExternalAuthProviders = (): AuthProvider[] => {
  return getAuthProviders().filter(provider => provider.name !== "password");
};
