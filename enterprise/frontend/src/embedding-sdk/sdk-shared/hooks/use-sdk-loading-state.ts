import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";
import {
  SdkLoadingError,
  SdkLoadingState,
} from "embedding-sdk/sdk-shared/types/sdk-loading";

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
