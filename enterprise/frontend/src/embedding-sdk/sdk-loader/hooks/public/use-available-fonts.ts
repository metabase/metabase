import { useLazySelector } from "embedding-sdk/sdk-loader/hooks/private/use-lazy-selector";

export const useAvailableFonts = () => {
  return {
    availableFonts:
      useLazySelector((state) =>
        window.MetabaseEmbeddingSDK?.getSetting(state, "available-fonts"),
      ) ?? null,
  };
};
