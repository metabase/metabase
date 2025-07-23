import { useEffect } from "react";

import { SDK_BUNDLE_SCRIPT_DATA_ATTRIBUTE_PASCAL_CASED } from "embedding-sdk/sdk-wrapper/config";
import { dispatchSdkBundleScriptLoadingEvent } from "embedding-sdk/sdk-wrapper/lib/private/dispatch-sdk-bundle-script-loading-event";
import { getSdkBundleScriptElement } from "embedding-sdk/sdk-wrapper/lib/private/get-sdk-bundle-script-element";

const loadSdkBundle = async (metabaseInstanceUrl: string) => {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");

    script.async = true;
    script.dataset[SDK_BUNDLE_SCRIPT_DATA_ATTRIBUTE_PASCAL_CASED] = "true";
    script.src = `${process.env.EMBEDDING_SDK_BUNDLE_HOST || metabaseInstanceUrl}/app/embedding-sdk.js`;

    document.body.appendChild(script);

    script.onload = () => {
      resolve();
    };
    script.onerror = (e) => {
      reject(new Error(`Failed to load embedding SDK bundle: ${e}`));
    };
  });
};

export function useLoadSdkBundle(metabaseInstanceUrl: string) {
  useEffect(() => {
    const load = async () => {
      const existingScript = getSdkBundleScriptElement();

      if (existingScript) {
        return;
      }

      dispatchSdkBundleScriptLoadingEvent("loading");

      try {
        await loadSdkBundle(metabaseInstanceUrl);
        dispatchSdkBundleScriptLoadingEvent("loaded");
      } catch (error) {
        dispatchSdkBundleScriptLoadingEvent("error");
      }
    };

    load();
  }, [metabaseInstanceUrl]);
}
