import { useCallback, useEffect, useState } from "react";

export function useSdkBundleLoading() {
  const [isLoading, setIsLoading] = useState(true);

  const handleSdkLoadedEvent = useCallback(() => {
    setIsLoading(false);
  }, []);

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

  return isLoading;
}
