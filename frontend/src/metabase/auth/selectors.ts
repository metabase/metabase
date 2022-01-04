import { createSelector } from "reselect";
import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";
import { getSettings } from "metabase/selectors/settings";
import { AuthProvider } from "./types";

export const getAuthProviders = createSelector(
  [getSettings],
  (): AuthProvider[] =>
    PLUGIN_AUTH_PROVIDERS.reduce(
      (providers, getProviders) => getProviders(providers),
      [],
    ),
);

export const getExternalAuthProviders = createSelector(
  [getAuthProviders],
  providers => providers.filter(provider => provider.name !== "password"),
);
