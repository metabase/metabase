import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";

export function getAuthProviders(state, props) {
  return PLUGIN_AUTH_PROVIDERS.reduce(
    (providers, getProviders) => getProviders(providers, state, props),
    [],
  );
}

export const getLoginError = state => state.auth && state.auth.loginError;
export const getResetError = state => state.auth && state.auth.resetError;
export const getResetSuccess = state => state.auth && state.auth.resetSuccess;
