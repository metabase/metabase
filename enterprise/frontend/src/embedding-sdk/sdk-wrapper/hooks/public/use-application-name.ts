import { useLazySelector } from "embedding-sdk/sdk-wrapper/hooks/private/use-lazy-selector";

export const useApplicationName = () =>
  useLazySelector(window.MetabaseEmbeddingSDK?.getApplicationName);
