import { useMemo } from "react";

import { useLazySelector } from "embedding-sdk-shared/hooks/use-lazy-selector";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

/**
 * Returns available fonts.
 * Returns `null` until the SDK is fully loaded and initialized.
 *
 * @function
 * @category useAvailableFonts
 */
export const useAvailableFonts = () => {
  const availableFonts = useLazySelector(
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.getAvailableFonts,
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
