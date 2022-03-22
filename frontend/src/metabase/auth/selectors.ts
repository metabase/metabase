import { createSelector } from "reselect";
import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";
import { State } from "metabase-types/store";
import { AuthProvider } from "./types";

export const getSettings = createSelector(
  (state: State) => state.settings,
  settings => settings.values,
);

export const getAuthProviders = createSelector(
  [getSettings],
  (): AuthProvider[] =>
    PLUGIN_AUTH_PROVIDERS.reduce(
      (providers: any, getProviders: (providers: any) => any) =>
        getProviders(providers),
      [],
    ),
);

export const getExternalAuthProviders = createSelector(
  [getAuthProviders],
  providers => providers.filter(provider => provider.name !== "password"),
);
