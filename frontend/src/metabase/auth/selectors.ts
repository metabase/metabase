import { createSelector } from "@reduxjs/toolkit";
import { getSettings } from "metabase/selectors/settings";
import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";
import { AuthProvider } from "metabase/plugins/types";

const EMPTY_PROVIDERS: AuthProvider[] = [];

export const getAuthProviders = createSelector([getSettings], () =>
  PLUGIN_AUTH_PROVIDERS.reduce(
    (providers, getProviders) => getProviders(providers),
    EMPTY_PROVIDERS,
  ),
);

export const getExternalAuthProviders = createSelector(
  [getAuthProviders],
  providers => providers.filter(provider => provider.name !== "password"),
);
