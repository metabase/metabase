import { createSelector } from "@reduxjs/toolkit";

import { getSettings } from "metabase/selectors/settings";
import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";

import type { AuthProvider } from "./types";

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
