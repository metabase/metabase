import { createSelector } from "@reduxjs/toolkit";

import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";
import type { AuthProvider } from "metabase/plugins/types";
import { getSettings } from "metabase/settings";

const EMPTY_PROVIDERS: AuthProvider[] = [];

export const getAuthProviders = createSelector([getSettings], () =>
  PLUGIN_AUTH_PROVIDERS.providers.reduce(
    (providers, getProviders) => getProviders(providers),
    EMPTY_PROVIDERS,
  ),
);

export const getExternalAuthProviders = createSelector(
  [getAuthProviders],
  (providers) => providers.filter((provider) => provider.name !== "password"),
);
