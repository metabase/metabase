import { useCallback, useEffect, useState } from "react";

import { shouldLoadSdkBundle } from "embedding-sdk/sdk-loader/lib/private/should-load-sdk-bundle";

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

  const handleSdkLoadedEvent = useCallback(() => {
    updateLoadingState(false);
  }, [updateLoadingState]);

  useEffect(() => {
    if (!shouldLoadSdkBundle()) {
      return;
    }

    const existingScript = document.querySelector(
      '[data-embedding-sdk-bundle="true"]',
    );

    if (existingScript) {
      return;
    }

    updateLoadingState(true);

    const script = document.createElement("script");

    script.dataset["embeddingSdkBundle"] = "true";
    script.src = "http://localhost:4600/bundle.bundle.js";

    document.head.appendChild(script);
  }, [updateLoadingState]);

  useEffect(() => {
    document.addEventListener(
      "metabase-embedding-sdk-loaded",
      handleSdkLoadedEvent,
    );

    return () => {
      document.removeEventListener(
        "metabase-embedding-sdk-loaded",
        handleSdkLoadedEvent,
      );
    };
  }, [handleSdkLoadedEvent]);

  return { isLoading };
}
