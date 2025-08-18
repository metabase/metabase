import { useMemo } from "react";

import { useLazySelector } from "embedding-sdk/sdk-shared/hooks/use-lazy-selector";
import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";

/**
 * Creates a dashboard.
 * Returns `null` until the SDK is fully loaded and initialized.
 *
 * @function
 * @category useCreateDashboardApi
 */
export const useCreateDashboardApi = () => {
  const {
    state: {
      internalProps: { reduxStore },
    },
  } = useMetabaseProviderPropsStore();

  const loginStatus = useLazySelector(
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.getLoginStatus,
  );
  const createDashboard =
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.createDashboard;

  /**
   * @function
   */
  const handleCreateDashboard = useMemo(
    () =>
      reduxStore &&
      loginStatus?.status === "success" &&
      createDashboard?.(reduxStore),
    [createDashboard, loginStatus?.status, reduxStore],
  );

  return useMemo(
    () =>
      handleCreateDashboard
        ? {
            /**
             * @param options
             */
            createDashboard: handleCreateDashboard,
          }
        : null,
    [handleCreateDashboard],
  );
};
