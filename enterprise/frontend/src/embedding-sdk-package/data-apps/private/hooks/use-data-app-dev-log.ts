import { useCallback } from "react";

import { useMetabaseProviderPropsStore } from "embedding-sdk-package/lib/provider-props-store";

/**
 * Logs data app errors to the console in the dev preview only, where the diagnostics feed picks them up.
 */
export const useDataAppDevLog = () => {
  const {
    state: {
      internalProps: { dataApp },
    },
  } = useMetabaseProviderPropsStore();

  const isDev = dataApp?.isDev === true;

  const logError = useCallback(
    (error: unknown) => {
      if (isDev) {
        console.error(error);
      }
    },
    [isDev],
  );

  return { logError };
};
