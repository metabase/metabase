import { useLazySelector } from "embedding-sdk-shared/hooks/use-lazy-selector";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

/**
 * Returns application name.
 * Returns `null` until the SDK is fully loaded and initialized.
 *
 * @function
 * @category useApplicationName
 */
export const useApplicationName = () =>
  useLazySelector(
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.getApplicationName,
  );
