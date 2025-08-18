import { useEffect } from "react";

import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import type { DisplayTheme } from "metabase/public/lib/types";

export function useGlobalTheme(theme: DisplayTheme | undefined) {
  useEffect(() => {
    // We don't want to modify user application DOM when using the SDK.
    if (isEmbeddingSdk() || theme == null) {
      return;
    }

    const element = document.documentElement;

    const originalTheme = element?.getAttribute("data-metabase-theme");
    element?.setAttribute("data-metabase-theme", theme);

    return () => {
      if (originalTheme == null) {
        element?.removeAttribute("data-metabase-theme");
      } else {
        element?.setAttribute("data-metabase-theme", originalTheme);
      }
    };
  }, [theme]);
}
