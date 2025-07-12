import { useLazySelector } from "embedding-sdk/sdk-loader/hooks/private/use-lazy-selector";

export const useMetabaseAuthStatus = () =>
  useLazySelector(window.MetabaseEmbeddingSDK?.getLoginStatus) ?? null;
