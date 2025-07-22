import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { useLazySelector } from "embedding-sdk/sdk-wrapper/hooks/private/use-lazy-selector";

export const useApplicationName = () =>
  useLazySelector(getWindow()?.MetabaseEmbeddingSDK?.getApplicationName);
