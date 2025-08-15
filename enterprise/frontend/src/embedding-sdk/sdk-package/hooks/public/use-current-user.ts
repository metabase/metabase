import { useLazySelector } from "embedding-sdk/sdk-package/hooks/private/use-lazy-selector";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import type { MetabaseUser } from "embedding-sdk/types/user";

/**
 * Returns the current user.
 * Returns `null` until the SDK is fully loaded and initialized.
 *
 * @function
 * @category useCurrentUser
 */
export const useCurrentUser: () => MetabaseUser | null = () =>
  useLazySelector(getWindow()?.MetabaseEmbeddingSDK?.getUser) ?? null;
