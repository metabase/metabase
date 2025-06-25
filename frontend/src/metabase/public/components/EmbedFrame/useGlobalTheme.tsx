import { useSelector } from "metabase/lib/redux";
import type { DisplayTheme } from "metabase/public/lib/types";
import { getIsEmbeddingSdk } from "metabase/selectors/embed";
import { useEffect } from "react";

export function useGlobalTheme(theme: DisplayTheme | undefined) {
  const isEmbeddingSdk = useSelector(getIsEmbeddingSdk);
  useEffect(() => {
    console.log("useGlobalTheme", theme);
    // We don't want to modify user application DOM when using the SDK.
    if (theme == null) {
      return;
    }

    const element = isEmbeddingSdk
      ? document.querySelector("#metabase-sdk-root")
      : document.documentElement;

    const originalTheme = element?.getAttribute("data-metabase-theme");
    element?.setAttribute("data-metabase-theme", theme);

    return () => {
      if (originalTheme == null) {
        element?.removeAttribute("data-metabase-theme");
      } else {
        element?.setAttribute("data-metabase-theme", originalTheme);
      }
    };
  }, [isEmbeddingSdk, theme]);
}
