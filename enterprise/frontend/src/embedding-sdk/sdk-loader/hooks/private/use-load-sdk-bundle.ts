import { useEffect } from "react";

import { isStorybookActive } from "metabase/env";

export function useLoadSdkBundle(metabaseInstanceUrl: string) {
  useEffect(() => {
    const existingScript = document.querySelector(
      '[data-embedding-sdk-bundle="true"]',
    );

    if (existingScript || isStorybookActive) {
      return;
    }

    const sdkLoadingEvent = new CustomEvent("metabase-embedding-sdk-loading", {
      bubbles: true,
      composed: true,
      detail: {
        status: "loading",
      },
    });

    document.dispatchEvent(sdkLoadingEvent);

    const script = document.createElement("script");

    script.dataset["embeddingSdkBundle"] = "true";
    script.src = `${metabaseInstanceUrl}/app/embedding-sdk.js`;

    document.body.appendChild(script);
  }, [metabaseInstanceUrl]);
}
