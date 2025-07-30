import { useCallback, useEffect, useState } from "react";

import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { SDK_BUNDLE_SCRIPT_LOADING_EVENT_NAME } from "embedding-sdk/sdk-wrapper/config";
import type {
  SdkBundleScriptLoadingEvent,
  SdkBundleScriptLoadingState,
} from "embedding-sdk/sdk-wrapper/types/sdk-bundle-script";

export function useWaitForSdkBundle() {
  const [loadingState, setLoadingState] = useState<SdkBundleScriptLoadingState>(
    getWindow()?.EMBEDDING_SDK_BUNDLE_LOADING_STATE ?? "loading",
  );

  const isNotStartedLoading = loadingState === "not-started-loading";
  const isLoading = loadingState === "loading";
  const isLoaded = loadingState === "loaded";
  const isError = loadingState === "error";

  const handleSdkLoadingEvent = useCallback((event: Event) => {
    const customEvent = event as CustomEvent<SdkBundleScriptLoadingEvent>;

    if (customEvent.detail.status) {
      setLoadingState(customEvent.detail.status);
    }
  }, []);

  useEffect(function handleSdkBundleUninitializedState() {
    setTimeout(() => {
      // If the EMBEDDING_SDK_BUNDLE_LOADING_STATE is not set after 1 second, it means the `useLoadSdkBundle` was not called
      if (!window.EMBEDDING_SDK_BUNDLE_LOADING_STATE) {
        setLoadingState("not-started-loading");
      }
    }, 1000);
  }, []);

  useEffect(
    function setupScriptLoadingEventHandlers() {
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
    },
    [handleSdkLoadingEvent],
  );

  return { isNotStartedLoading, isLoading, isLoaded, isError };
}
