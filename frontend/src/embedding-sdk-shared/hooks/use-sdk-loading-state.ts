import { SdkLoadingError, SdkLoadingState } from "../types/sdk-loading";

import { useMetabaseProviderPropsStore } from "./use-metabase-provider-props-store";

export function useSdkLoadingState() {
  const {
    state: {
      internalProps: { loadingState, loadingError },
    },
  } = useMetabaseProviderPropsStore();

  const isError = loadingError === SdkLoadingError.Error;
  const isNotStartedLoading =
    loadingError === SdkLoadingError.NotStartedLoading;

  const isInitial = loadingState === SdkLoadingState.Initial;
  const isLoading = loadingState === SdkLoadingState.Loading;
  const isLoaded = loadingState === SdkLoadingState.Loaded;
  const isInitialized = loadingState === SdkLoadingState.Initialized;

  return {
    loadingState,
    loadingError,

    isInitial,
    isLoading,
    isLoaded,
    isInitialized,

    isError,
    isNotStartedLoading,
  };
}
