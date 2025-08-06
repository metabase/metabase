import { useMemo } from "react";

import { useLazySelector } from "embedding-sdk/sdk-package/hooks/private/use-lazy-selector";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";

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

  return useMemo(
    () =>
      availableFonts
        ? {
            availableFonts,
          }
        : null,
    [availableFonts],
  );
};
