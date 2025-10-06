import { useLazySelector } from "embedding-sdk-shared/hooks/use-lazy-selector";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

/**
 * Returns the authentication status of the current user in the Metabase embedding SDK.
 * Returns `null` until the SDK is fully loaded and initialized.
 *
 * @function
 * @category useMetabaseAuthStatus
 */
export const useMetabaseAuthStatus = () =>
  useLazySelector(getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.getLoginStatus) ??
  null;
