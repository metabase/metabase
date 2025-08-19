import { useMemo } from "react";

import { useLazySelector } from "embedding-sdk/sdk-shared/hooks/use-lazy-selector";
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
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.getSetting(
      state,
      "available-fonts",
    ),
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
