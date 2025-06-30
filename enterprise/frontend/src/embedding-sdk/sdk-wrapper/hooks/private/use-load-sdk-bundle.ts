import { useEffect } from "react";

import { getSdkBundleScriptElement } from "embedding-sdk/sdk-wrapper/lib/private/get-sdk-bundle-script-element";

export function useLoadSdkBundle(metabaseInstanceUrl: string) {
  useEffect(() => {
    // TODO: use a global variable instead of checking the DOM
    const existingScript = getSdkBundleScriptElement();

    if (existingScript) {
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

    script.async = true;
    script.dataset["embeddingSdkBundle"] = "true";
    script.src = `${process.env.EMBEDDING_SDK_BUNDLE_HOST || metabaseInstanceUrl}/app/embedding-sdk.js`;

    document.body.appendChild(script);
  }, [metabaseInstanceUrl]);
}
