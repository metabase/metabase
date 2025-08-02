import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { useLazySelector } from "embedding-sdk/sdk-wrapper/hooks/private/use-lazy-selector";

/**
 * Returns application name.
 * Returns `null` until the SDK is fully loaded and initialized.
 *
 * @function
 * @category useApplicationName
 */
export const useApplicationName = () =>
  useLazySelector(getWindow()?.MetabaseEmbeddingSDK?.getApplicationName);
