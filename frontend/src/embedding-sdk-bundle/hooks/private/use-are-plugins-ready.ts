import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getPluginsReady } from "embedding-sdk-bundle/store/selectors";
import { isEmbeddingEajs } from "metabase/embedding-sdk/config";

/**
 * Returns whether the EE plugins have been initialized.
 *
 * For EAJS, plugins are always initialized in the entrypoint,
 * so this always returns true.
 *
 * Can be used inside PublicComponentWrapper or public hooks
 * to gate rendering until plugins are ready.
 */
export function useArePluginsReady(): boolean {
  const pluginsReady = useSdkSelector(getPluginsReady);

  // EAJS initializes plugins in its own entrypoint,
  // so they are always ready.
  if (isEmbeddingEajs()) {
    return true;
  }

  return pluginsReady;
}
