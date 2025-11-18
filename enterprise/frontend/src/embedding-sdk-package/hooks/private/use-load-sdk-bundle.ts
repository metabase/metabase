import { useEffect } from "react";

// eslint-disable-next-line no-external-references-for-sdk-package-code
import { SDK_BUNDLE_FULL_PATH } from "build-configs/embedding-sdk/constants/sdk-bundle";
import { SDK_BUNDLE_SCRIPT_DATA_ATTRIBUTE_PASCAL_CASED } from "embedding-sdk-package/constants/sdk-bundle-script-data-attribute-name";
import { getSdkBundleScriptElement } from "embedding-sdk-package/lib/private/get-sdk-bundle-script-element";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import {
  getPerfNow,
  logPerfDuration,
  logPerfEvent,
} from "embedding-sdk-shared/lib/logging/perf-logger";
import {
  SdkLoadingError,
  SdkLoadingState,
} from "embedding-sdk-shared/types/sdk-loading";

const ERROR_MESSAGE = "Failed to load Embedding SDK bundle";
const BUNDLE_LOG_SCOPE = "bundle-loader";

const waitForScriptLoading = (script: HTMLScriptElement) => {
  return new Promise<void>((resolve, reject) => {
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error(ERROR_MESSAGE)));
  });
};

const trackBundleLoad = <T>(
  promise: Promise<T>,
  startTime: number,
  details: Record<string, unknown>,
) => {
  return promise
    .then(value => {
      logPerfDuration(
        BUNDLE_LOG_SCOPE,
        "bundle script loaded",
        startTime,
        details,
      );
      return value;
    })
    .catch(error => {
      logPerfDuration(
        BUNDLE_LOG_SCOPE,
        "bundle script failed",
        startTime,
        {
          ...details,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      throw error;
    });
};

const loadSdkBundle = (
  metabaseInstanceUrl: string,
  existingLoadingPromise: Promise<void> | null | undefined,
): Promise<void> => {
  if (existingLoadingPromise) {
    logPerfEvent(BUNDLE_LOG_SCOPE, "bundle load already pending", {
      instanceUrl: metabaseInstanceUrl,
    });
    return existingLoadingPromise;
  }

  const existingScript = getSdkBundleScriptElement();

  if (existingScript) {
    const waitStart = getPerfNow();
    logPerfEvent(BUNDLE_LOG_SCOPE, "waiting for existing bundle script", {
      instanceUrl: metabaseInstanceUrl,
    });
    return trackBundleLoad(
      waitForScriptLoading(existingScript),
      waitStart,
      {
        instanceUrl: metabaseInstanceUrl,
        src: existingScript.src,
        mode: "existing-script",
      },
    );
  }

  const script = document.createElement("script");

  script.async = true;
  script.dataset[SDK_BUNDLE_SCRIPT_DATA_ATTRIBUTE_PASCAL_CASED] = "true";
  script.src = `${
    process.env.EMBEDDING_SDK_BUNDLE_HOST || metabaseInstanceUrl
  }/${SDK_BUNDLE_FULL_PATH}`;

  const loadStart = getPerfNow();
  logPerfEvent(BUNDLE_LOG_SCOPE, "start loading bundle script", {
    instanceUrl: metabaseInstanceUrl,
    src: script.src,
  });

  document.body.appendChild(script);

  return trackBundleLoad(
    waitForScriptLoading(script),
    loadStart,
    {
      instanceUrl: metabaseInstanceUrl,
      src: script.src,
      mode: "new-script",
    },
  );
};

export function useLoadSdkBundle(metabaseInstanceUrl: string) {
  useEffect(() => {
    const metabaseProviderPropsStore = ensureMetabaseProviderPropsStore();
    const { loadingPromise: existingLoadingPromise, loadingState } =
      metabaseProviderPropsStore.getState().internalProps;

    // The SDK bundle script was loaded before
    if (window.METABASE_EMBEDDING_SDK_BUNDLE) {
      logPerfEvent(BUNDLE_LOG_SCOPE, "bundle already initialized", {
        instanceUrl: metabaseInstanceUrl,
      });
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
