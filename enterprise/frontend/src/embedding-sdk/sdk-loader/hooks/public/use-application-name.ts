import { useLazySelector } from "embedding-sdk/sdk-loader/hooks/private/use-lazy-selector";

export const useApplicationName = () =>
  useLazySelector(window.MetabaseEmbeddingSDK?.getApplicationName);
