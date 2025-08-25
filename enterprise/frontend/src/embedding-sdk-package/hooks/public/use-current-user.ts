import type { MetabaseUser } from "embedding-sdk-bundle/types/user";
import { useLazySelector } from "embedding-sdk-shared/hooks/use-lazy-selector";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

/**
 * Returns the current user.
 * Returns `null` until the SDK is fully loaded and initialized.
 *
 * @function
 * @category useCurrentUser
 */
export const useCurrentUser: () => MetabaseUser | null = () =>
  useLazySelector(getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.getUser) ?? null;
