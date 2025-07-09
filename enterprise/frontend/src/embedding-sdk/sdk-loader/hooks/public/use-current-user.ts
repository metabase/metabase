import { useLazySelector } from "embedding-sdk/sdk-loader/hooks/private/use-lazy-selector";
import type { MetabaseUser } from "embedding-sdk/types/user";

export const useCurrentUser: () => MetabaseUser | null = () =>
  useLazySelector(window.MetabaseEmbeddingSDK?.getUser) ?? null;
