import { type PropsWithChildren, useEffect } from "react";

import { useSdkBundleLoading } from "embedding-sdk/sdk-loader/hooks/private/use-sdk-bundle-loading";
import { shouldLoadSdkBundle } from "embedding-sdk/sdk-loader/lib/private/should-load-sdk-bundle";

export const SdkLoader = ({ children }: PropsWithChildren) => {
  const isLoading = useSdkBundleLoading();

  useEffect(() => {
    if (!isLoading || !shouldLoadSdkBundle()) {
      return;
    }

    const script = document.createElement("script");

    script.dataset["embeddingSdkBundle"] = "true";
    script.src = "http://localhost:4600/bundle.bundle.js";

    document.head.appendChild(script);
  }, [isLoading]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return children;
};
