import { useEffect } from "react";

import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import type { DisplayTheme } from "metabase/public/lib/types";

export function useGlobalTheme(theme: DisplayTheme | undefined) {
  useEffect(() => {
    // We don't want to modify user application DOM when using the SDK.
    if (isEmbeddingSdk() || theme == null) {
      return;
    }

    const originalTheme = document.documentElement.getAttribute(
      "data-metabase-theme",
    );
    document.documentElement.setAttribute("data-metabase-theme", theme);

    return () => {
      if (originalTheme == null) {
        document.documentElement.removeAttribute("data-metabase-theme");
      } else {
        document.documentElement.setAttribute(
          "data-metabase-theme",
          originalTheme,
        );
      }
    };
  }, [theme]);
}
