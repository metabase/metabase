import { useCallback, useEffect, useState } from "react";

import { SDK_BUNDLE_SCRIPT_LOADING_EVENT_NAME } from "embedding-sdk/sdk-wrapper/config";
import type {
  SdkBundleScriptLoadingEvent,
  SdkBundleScriptLoadingState,
} from "embedding-sdk/sdk-wrapper/types/sdk-bundle-script";

export function useWaitForSdkBundle() {
  const [loadingState, setLoadingState] = useState<SdkBundleScriptLoadingState>(
    window.EMBEDDING_SDK_BUNDLE_LOADING_STATE ?? "loading",
  );

  const isLoaded = loadingState === "loaded";
  const isLoading = loadingState === "loading";
  const isError = loadingState === "error";

  const updateLoadingState = useCallback(
    (loadingState: SdkBundleScriptLoadingState) => {
      window.EMBEDDING_SDK_BUNDLE_LOADING_STATE = loadingState;
      setLoadingState(loadingState);
    },
    [setLoadingState],
  );

  const handleSdkLoadingEvent = useCallback(
    (event: Event) => {
      const customEvent = event as CustomEvent<SdkBundleScriptLoadingEvent>;

      if (customEvent.detail.status) {
        updateLoadingState(customEvent.detail.status);
      }
    },
    [updateLoadingState],
  );

  useEffect(() => {
    document.addEventListener(
      SDK_BUNDLE_SCRIPT_LOADING_EVENT_NAME,
      handleSdkLoadingEvent,
    );

    return () => {
      document.removeEventListener(
        SDK_BUNDLE_SCRIPT_LOADING_EVENT_NAME,
        handleSdkLoadingEvent,
      );
    };
  }, [handleSdkLoadingEvent]);

  return { isLoaded, isLoading, isError };
}
