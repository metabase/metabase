import { useCallback, useEffect, useState } from "react";

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
      const customEvent = event as CustomEvent<{
        status: "loading" | "loaded";
      }>;

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
      "metabase-embedding-sdk-loading",
      handleSdkLoadingEvent,
    );

    return () => {
      document.removeEventListener(
        "metabase-embedding-sdk-loading",
        handleSdkLoadingEvent,
      );
    };
  }, [handleSdkLoadingEvent]);

  return { isLoading };
}
