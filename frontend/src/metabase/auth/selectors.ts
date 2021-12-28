import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";

export const getProviders = (state: any, props: any) => {
  return PLUGIN_AUTH_PROVIDERS.reduce(
    (providers, getProviders) => getProviders(providers, state, props),
    [],
  );
};
