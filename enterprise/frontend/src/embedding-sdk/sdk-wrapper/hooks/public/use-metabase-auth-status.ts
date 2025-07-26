import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { useLazySelector } from "embedding-sdk/sdk-wrapper/hooks/private/use-lazy-selector";

export const useMetabaseAuthStatus = () =>
  useLazySelector(getWindow()?.MetabaseEmbeddingSDK?.getLoginStatus) ?? null;
