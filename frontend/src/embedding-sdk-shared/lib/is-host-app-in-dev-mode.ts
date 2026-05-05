import { getWindow } from "embedding-sdk-shared/lib/get-window";

/**
 * Returns true if the host application's bundler resolved the SDK package
 * using the "development" exports condition, indicating dev mode.
 *
 * This is set by the SDK package's development entry point and read
 * by the SDK bundle at runtime.
 */
export function isHostAppInDevMode(): boolean {
  try {
    return getWindow()?.METABASE_EMBEDDING_SDK_IS_HOST_APP_IN_DEV_MODE === true;
  } catch (e) {
    return false;
  }
}
