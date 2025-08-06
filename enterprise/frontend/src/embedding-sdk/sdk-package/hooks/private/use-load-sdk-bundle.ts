import { useEffect } from "react";

import { SDK_BUNDLE_SCRIPT_DATA_ATTRIBUTE_PASCAL_CASED } from "embedding-sdk/sdk-package/config";
import { getSdkBundleScriptElement } from "embedding-sdk/sdk-package/lib/private/get-sdk-bundle-script-element";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/lib/ensure-metabase-provider-props-store";
import {
  SdkLoadingError,
  SdkLoadingState,
} from "embedding-sdk/sdk-shared/types/sdk-loading";

const loadSdkBundle = (
  metabaseInstanceUrl: string,
  loadingPromise: Promise<void> | null | undefined,
): Promise<void> => {
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = new Promise<void>((resolve, reject) => {
    const existingScript = getSdkBundleScriptElement();

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve());
      existingScript.addEventListener("error", () =>
        reject(new Error("Failed to load Embedding SDK bundle")),
      );

      return;
    }

    const script = document.createElement("script");

    script.async = true;
    script.dataset[SDK_BUNDLE_SCRIPT_DATA_ATTRIBUTE_PASCAL_CASED] = "true";
    script.src = `${
      process.env.EMBEDDING_SDK_BUNDLE_HOST || metabaseInstanceUrl
    }/app/embedding-sdk.js`;

    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () =>
      reject(new Error("Failed to load Embedding SDK bundle")),
    );

    document.body.appendChild(script);
  });

  return loadingPromise;
};

export function useLoadSdkBundle(metabaseInstanceUrl: string) {
  useEffect(() => {
    const metabaseProviderPropsStore = ensureMetabaseProviderPropsStore();
    const { loadingPromise, loadingState } =
      metabaseProviderPropsStore.getSnapshot();

    // The SDK bundle script was loaded before
    if (window.MetabaseEmbeddingSDK) {
      // After the SDK bundle script was loaded, the MetabaseProviderProps store may be cleaned up.
      // It happens when the root MetabaseProvider component is unmounted and remounted later.
      // In this case we don't need to load the SDK bundle again, but we have to set the proper `Loaded` state.
      if (loadingState === SdkLoadingState.Initial) {
        metabaseProviderPropsStore.updateInternalProps({
          loadingState: SdkLoadingState.Loaded,
          loadingError: null,
        });
      }

      return;
    }

    metabaseProviderPropsStore.updateInternalProps({
      loadingState: SdkLoadingState.Loading,
      loadingError: null,
    });

    loadSdkBundle(metabaseInstanceUrl, loadingPromise)
      .then(() => {
        metabaseProviderPropsStore.updateInternalProps({
          loadingPromise,
          loadingState: SdkLoadingState.Loaded,
          loadingError: null,
        });
      })
      .catch((err) => {
        console.error("Error loading SDK bundle:", err);
        metabaseProviderPropsStore.updateInternalProps({
          loadingPromise: null,
          loadingError: SdkLoadingError.Error,
        });
      });
  }, [metabaseInstanceUrl]);
}
