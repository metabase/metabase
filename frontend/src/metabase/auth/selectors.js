import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";

export function getAuthProviders(state, props) {
  return PLUGIN_AUTH_PROVIDERS.reduce(
    (providers, getProviders) => getProviders(providers, state, props),
    [],
  );
}
