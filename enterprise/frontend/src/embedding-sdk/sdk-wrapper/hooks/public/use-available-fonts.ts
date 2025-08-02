import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { useLazySelector } from "embedding-sdk/sdk-wrapper/hooks/private/use-lazy-selector";

/**
 * Returns available fonts.
 * Returns `null` until the SDK is fully loaded and initialized.
 *
 * @function
 * @category useAvailableFonts
 */
export const useAvailableFonts = () => {
  const availableFonts = useLazySelector((state) =>
    getWindow()?.MetabaseEmbeddingSDK?.getSetting(state, "available-fonts"),
  );

  return availableFonts
    ? {
        availableFonts,
      }
    : null;
};
