import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { useLazySelector } from "embedding-sdk/sdk-wrapper/hooks/private/use-lazy-selector";

/**
 * Returns the authentication status of the current user in the Metabase embedding SDK.
 * Returns `null` until the SDK is fully loaded and initialized.
 *
 * @function
 * @category useMetabaseAuthStatus
 */
export const useMetabaseAuthStatus = () =>
  useLazySelector(getWindow()?.MetabaseEmbeddingSDK?.getLoginStatus) ?? null;
