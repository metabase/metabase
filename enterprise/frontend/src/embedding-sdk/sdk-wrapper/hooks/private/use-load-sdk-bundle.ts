import { useEffect } from "react";

import { SDK_BUNDLE_SCRIPT_DATA_ATTRIBUTE_PASCAL_CASED } from "embedding-sdk/sdk-wrapper/config";
import { dispatchSdkBundleScriptLoadingEvent } from "embedding-sdk/sdk-wrapper/lib/private/dispatch-sdk-bundle-script-loading-event";
import { getSdkBundleScriptElement } from "embedding-sdk/sdk-wrapper/lib/private/get-sdk-bundle-script-element";
import type { SdkBundleScriptLoadingEvent } from "embedding-sdk/sdk-wrapper/types/sdk-bundle-script";

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
    script.onerror = () => {
      reject(new Error("Failed to load Embedding SDK bundle"));
    };
    script.onabort = () => {
      reject(new Error("Loading of Embedding SDK bundle was aborted"));
    };
  });
};

const dispatchLoadingState = (
  status: SdkBundleScriptLoadingEvent["status"],
) => {
  window.EMBEDDING_SDK_BUNDLE_LOADING_STATE = status;
  dispatchSdkBundleScriptLoadingEvent(status);
};

export function useLoadSdkBundle(metabaseInstanceUrl: string) {
  useEffect(() => {
    const load = async () => {
      const existingScript = getSdkBundleScriptElement();

      if (existingScript) {
        return;
      }

      dispatchLoadingState("loading");

      try {
        await loadSdkBundle(metabaseInstanceUrl);
        dispatchLoadingState("loaded");
      } catch (error) {
        console.error("Error loading SDK bundle:", error);
        dispatchLoadingState("error");
      }
    };

    load();
  }, [metabaseInstanceUrl]);
}
