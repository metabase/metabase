import { useEffect } from "react";

 
import { SDK_BUNDLE_FULL_PATH } from "build-configs/embedding-sdk/constants/sdk-bundle";
import { SDK_BUNDLE_SCRIPT_DATA_ATTRIBUTE_PASCAL_CASED } from "embedding-sdk-package/constants/sdk-bundle-script-data-attribute-name";
import { getSdkBundleScriptElement } from "embedding-sdk-package/lib/private/get-sdk-bundle-script-element";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import {
  SdkLoadingError,
  SdkLoadingState,
} from "embedding-sdk-shared/types/sdk-loading";

const ERROR_MESSAGE = "Failed to load Embedding SDK bundle";

const waitForScriptLoading = (script: HTMLScriptElement) => {
  return new Promise<void>((resolve, reject) => {
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error(ERROR_MESSAGE)));
  });
};

const loadSdkBundle = (
  metabaseInstanceUrl: string,
  existingLoadingPromise: Promise<void> | null | undefined,
): Promise<void> => {
  if (existingLoadingPromise) {
    return existingLoadingPromise;
  }

  const existingScript = getSdkBundleScriptElement();

  if (existingScript) {
    return waitForScriptLoading(existingScript);
  }

  const script = document.createElement("script");

  script.async = true;
  script.dataset[SDK_BUNDLE_SCRIPT_DATA_ATTRIBUTE_PASCAL_CASED] = "true";
  script.src = `${
    process.env.EMBEDDING_SDK_BUNDLE_HOST || metabaseInstanceUrl
  }/${SDK_BUNDLE_FULL_PATH}`;

  document.body.appendChild(script);

  return waitForScriptLoading(script);
};

export function useLoadSdkBundle(metabaseInstanceUrl: string) {
  useEffect(() => {
    const metabaseProviderPropsStore = ensureMetabaseProviderPropsStore();
    const { loadingPromise: existingLoadingPromise, loadingState } =
      metabaseProviderPropsStore.getState().internalProps;

    // The SDK bundle script was loaded before
    if (window.METABASE_EMBEDDING_SDK_BUNDLE) {
      // After the SDK bundle script was loaded, the MetabaseProviderProps store may be cleaned up.
      // It happens when the MetabaseProvider component is unmounted and remounted later.
      // In this case we don't need to load the SDK bundle again, but we have to set the proper `Loaded` state.
      if (loadingState === SdkLoadingState.Initial) {
        metabaseProviderPropsStore.updateInternalProps({
          loadingState: SdkLoadingState.Loaded,
          loadingError: null,
        });
      }

      return;
    }

    const loadingPromise = loadSdkBundle(
      metabaseInstanceUrl,
      existingLoadingPromise,
    );

    metabaseProviderPropsStore.updateInternalProps({
      loadingPromise,
      loadingState: SdkLoadingState.Loading,
      loadingError: null,
    });

    loadingPromise
      .then(() => {
        metabaseProviderPropsStore.updateInternalProps({
          loadingPromise: null,
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
