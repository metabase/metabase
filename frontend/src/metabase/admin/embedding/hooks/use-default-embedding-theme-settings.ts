import { useMemo } from "react";

import { useSetting } from "metabase/common/hooks";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";

import { deriveSdkThemeSettings } from "../utils/derive-sdk-theme-settings";

/**
 * Returns a default embedding theme (Light variant) with colors mapped from the
 * instance's appearance settings (white-labeled colors).
 *
 * Used by the theme editor to reset colors back to defaults and to produce the
 * default theme object for a newly-created theme.
 *
 * TODO(EMB-948): derive this from the theme editor's color configuration instead!
 */
export function useDefaultEmbeddingThemeSettings(): MetabaseTheme {
  const whitelabelColors = useSetting("application-colors");

  return useMemo(
    () => deriveSdkThemeSettings("light", whitelabelColors ?? {}),
    [whitelabelColors],
  );
}
