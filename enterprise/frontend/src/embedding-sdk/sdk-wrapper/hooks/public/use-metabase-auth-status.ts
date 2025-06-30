import { useLazySelector } from "embedding-sdk/sdk-wrapper/hooks/private/use-lazy-selector";

export const useMetabaseAuthStatus = () =>
  useLazySelector(window.MetabaseEmbeddingSDK?.getLoginStatus) ?? null;
