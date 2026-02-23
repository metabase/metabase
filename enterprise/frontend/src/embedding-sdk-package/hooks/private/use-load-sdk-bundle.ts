import { useEffect } from "react";

// eslint-disable-next-line metabase/no-external-references-for-sdk-package-code
import { SDK_BUNDLE_FULL_PATH } from "build-configs/embedding-sdk/constants/sdk-bundle";
import { SDK_BUNDLE_SCRIPT_DATA_ATTRIBUTE_PASCAL_CASED } from "embedding-sdk-package/constants/sdk-bundle-script-data-attribute-name";
import { getSdkBundleScriptElement } from "embedding-sdk-package/lib/private/get-sdk-bundle-script-element";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import {
  SdkLoadingError,
  SdkLoadingState,
} from "embedding-sdk-shared/types/sdk-loading";

const ERROR_MESSAGE = "Failed to load Embedding SDK bundle";

const SDK_PACKAGE_VERSION = process.env.VERSION || "unknown";

/**
 * Dual-listen: resolves when the SDK bundle is ready, regardless of whether
 * the server responded with the bootstrap (new backend) or the monolithic
 * bundle (old backend / bootstrap=false).
 *
 * - On script `load`: if `window.METABASE_EMBEDDING_SDK_BUNDLE` is already
 *   set, the monolithic bundle ran synchronously → resolve.
 * - On `"metabase-sdk-bundle-loaded"` CustomEvent: the bootstrap loaded all
 *   chunks and `main-bundle.ts` executed → resolve.
 * - First signal wins; all listeners are cleaned up after settling.
 */
const waitForScriptLoading = (script: HTMLScriptElement) => {
  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const settle = (action: () => void) => {
      if (!settled) {
        settled = true;
        cleanup();
        action();
      }
    };

    const onBundleEvent = () => {
      console.log("SDK loader: received 'metabase-sdk-bundle-loaded' event");
      settle(() => resolve());
    };

    const onScriptLoad = () => {
      if (window.METABASE_EMBEDDING_SDK_BUNDLE) {
        // Old backend served the monolithic bundle (or new backend served
        // monolithic because bootstrap=false / no packageVersion param).
        // The global is set synchronously during script execution → resolve.
        console.log("SDK loader: script loaded, bundle global found → ready");
        settle(() => resolve());
      } else {
        // The bootstrap loaded. It will load chunks in parallel, and
        // main-bundle.ts will dispatch the custom event when done.
        console.log(
          "SDK loader: script loaded, no bundle global → waiting for chunks",
        );
      }
    };

    const onScriptError = () => {
      settle(() => reject(new Error(ERROR_MESSAGE)));
    };

    const cleanup = () => {
      document.removeEventListener("metabase-sdk-bundle-loaded", onBundleEvent);
      script.removeEventListener("load", onScriptLoad);
      script.removeEventListener("error", onScriptError);
    };

    document.addEventListener("metabase-sdk-bundle-loaded", onBundleEvent);
    script.addEventListener("load", onScriptLoad);
    script.addEventListener("error", onScriptError);
  });
};

const loadSdkBundle = (
  metabaseInstanceUrl: string,
  existingLoadingPromise: Promise<void> | null | undefined,
  useBootstrap: boolean,
): Promise<void> => {
  if (existingLoadingPromise) {
    return existingLoadingPromise;
  }

  const existingScript = getSdkBundleScriptElement();

  if (existingScript) {
    return waitForScriptLoading(existingScript);
  }

  const baseUrl = `${
    process.env.EMBEDDING_SDK_BUNDLE_HOST || metabaseInstanceUrl
  }/${SDK_BUNDLE_FULL_PATH}`;

  const script = document.createElement("script");

  console.log("useLoadSdkBundle", {
    baseUrl,
    useBootstrap,
    SDK_PACKAGE_VERSION,
  });

  script.async = true;
  script.dataset[SDK_BUNDLE_SCRIPT_DATA_ATTRIBUTE_PASCAL_CASED] = "true";
  script.src = useBootstrap
    ? `${baseUrl}?packageVersion=${encodeURIComponent(SDK_PACKAGE_VERSION)}`
    : baseUrl;

  document.body.appendChild(script);

  return waitForScriptLoading(script);
};

interface UseLoadSdkBundleOptions {
  bootstrap: boolean;
}

export function useLoadSdkBundle(
  metabaseInstanceUrl: string,
  options: UseLoadSdkBundleOptions,
) {
  const { bootstrap } = options;

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
      bootstrap,
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
  }, [metabaseInstanceUrl, bootstrap]);
}
