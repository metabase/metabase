import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { useLazySelector } from "embedding-sdk/sdk-wrapper/hooks/private/use-lazy-selector";
import type { MetabaseUser } from "embedding-sdk/types/user";

export const useCurrentUser: () => MetabaseUser | null = () =>
  useLazySelector(getWindow()?.MetabaseEmbeddingSDK?.getUser) ?? null;
