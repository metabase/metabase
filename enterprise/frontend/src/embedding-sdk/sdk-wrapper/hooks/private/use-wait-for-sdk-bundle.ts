import { useCallback, useEffect, useState } from "react";

import { SCRIPT_TAG_LOADING_EVENT_NAME } from "embedding-sdk/sdk-wrapper/config";
import type { ScriptTagLoadingEvent } from "embedding-sdk/sdk-wrapper/types/script-tag";

export function useWaitForSdkBundle() {
  const [isLoading, setLoading] = useState<boolean>(
    window.EMBEDDING_SDK_BUNDLE_LOADING ?? true,
  );

  const updateLoadingState = useCallback(
    (isLoading: boolean) => {
      window.EMBEDDING_SDK_BUNDLE_LOADING = isLoading;
      setLoading(isLoading);
    },
    [setLoading],
  );

  const handleSdkLoadingEvent = useCallback(
    (event: Event) => {
      const customEvent = event as CustomEvent<ScriptTagLoadingEvent>;

      switch (customEvent.detail.status) {
        case "loading":
          updateLoadingState(true);
          return;
        case "loaded":
          updateLoadingState(false);
          return;
      }
    },
    [updateLoadingState],
  );

  useEffect(() => {
    document.addEventListener(
      SCRIPT_TAG_LOADING_EVENT_NAME,
      handleSdkLoadingEvent,
    );

    return () => {
      document.removeEventListener(
        SCRIPT_TAG_LOADING_EVENT_NAME,
        handleSdkLoadingEvent,
      );
    };
  }, [handleSdkLoadingEvent]);

  return { isLoading };
}
